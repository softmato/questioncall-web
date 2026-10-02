import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/unified-auth";
import { processExpiredChannels } from "@/lib/channel-expiration";
import {
  CHANNEL_EXTENSION_MINUTES,
  CHANNEL_WARNING_THRESHOLD_MS,
  MAX_CHANNEL_TIME_EXTENSIONS,
  getChannelTimeRemainingMs,
} from "@/lib/channel-timer";
import { connectToDatabase } from "@/lib/mongodb";
import { emitChannelTimerUpdated } from "@/lib/pusher/pusherServer";
import Channel from "@/models/Channel";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteParams) {
  try {
    const user = await getAuthenticatedUser(_request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: channelId } = await context.params;
    if (!Types.ObjectId.isValid(channelId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const userId = user.id;

    await connectToDatabase();

    let channel = await Channel.findById(channelId)
      .select("status timerDeadline askerId acceptorId timeExtensionCount")
      .lean();

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const askerId = channel.askerId.toString();
    const acceptorId = channel.acceptorId.toString();

    if (userId !== askerId && userId !== acceptorId) {
      return NextResponse.json(
        { error: "You are not a participant of this channel." },
        { status: 403 },
      );
    }

    if (channel.status === "ACTIVE") {
      const timerDeadlineMs = new Date(channel.timerDeadline).getTime();
      if (timerDeadlineMs <= Date.now()) {
        await processExpiredChannels({ channelId });
        channel = await Channel.findById(channelId)
          .select("status timerDeadline askerId acceptorId timeExtensionCount")
          .lean();

        if (!channel) {
          return NextResponse.json({ error: "Channel not found" }, { status: 404 });
        }
      }
    }

    if (channel.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Only active channels can be extended." },
        { status: 409 },
      );
    }

    const timeExtensionCount = channel.timeExtensionCount ?? 0;
    if (timeExtensionCount >= MAX_CHANNEL_TIME_EXTENSIONS) {
      return NextResponse.json(
        { error: "The maximum number of 5-minute extensions has already been used." },
        { status: 409 },
      );
    }

    const remainingMs = getChannelTimeRemainingMs(channel.timerDeadline);
    if (remainingMs <= 0) {
      return NextResponse.json(
        { error: "This channel has already run out of time." },
        { status: 409 },
      );
    }

    if (remainingMs > CHANNEL_WARNING_THRESHOLD_MS) {
      return NextResponse.json(
        { error: "You can only add more time during the final 5 minutes." },
        { status: 409 },
      );
    }

    const nextDeadline = new Date(
      new Date(channel.timerDeadline).getTime() + CHANNEL_EXTENSION_MINUTES * 60 * 1000,
    );

    const updatedChannel = await Channel.findOneAndUpdate(
      {
        _id: channelId,
        status: "ACTIVE",
        timerDeadline: channel.timerDeadline,
        timeExtensionCount,
      },
      {
        $set: {
          timerDeadline: nextDeadline,
          lastDeadlineWarningAt: null,
        },
        $inc: {
          timeExtensionCount: 1,
        },
      },
      {
        new: true,
      },
    )
      .select("timerDeadline timeExtensionCount")
      .lean();

    if (!updatedChannel) {
      return NextResponse.json(
        { error: "The channel timer changed. Please try again." },
        { status: 409 },
      );
    }

    await emitChannelTimerUpdated(channelId, {
      timerDeadline: new Date(updatedChannel.timerDeadline).toISOString(),
      timeExtensionCount: updatedChannel.timeExtensionCount ?? 0,
      extendedBy: userId,
      extendedByName: user.name || "A participant",
      extensionMinutes: CHANNEL_EXTENSION_MINUTES,
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      timerDeadline: new Date(updatedChannel.timerDeadline).toISOString(),
      timeExtensionCount: updatedChannel.timeExtensionCount ?? 0,
      extensionMinutes: CHANNEL_EXTENSION_MINUTES,
    });
  } catch (error) {
    console.error("[POST /api/channels/[id]/extend]", error);
    return NextResponse.json(
      { error: "Failed to extend channel time" },
      { status: 500 },
    );
  }
}
