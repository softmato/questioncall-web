import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { getAuthenticatedUser } from "@/lib/unified-auth";
import { connectToDatabase } from "@/lib/mongodb";
import { pusherServer, emitMessagesSeen } from "@/lib/pusher/pusherServer";
import { getUserPusherName, CHANNEL_UPDATED_EVENT } from "@/lib/pusher/events";
import Channel from "@/models/Channel";
import Message from "@/models/Message";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteParams) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: channelId } = await context.params;
    if (!Types.ObjectId.isValid(channelId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const userId = user.id;

    await connectToDatabase();

    // Verify channel exists and user is a participant
    const channel = await Channel.findById(channelId).lean();

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const askerId = channel.askerId.toString();
    const acceptorId = channel.acceptorId.toString();

    if (userId !== askerId && userId !== acceptorId) {
      return NextResponse.json(
        { error: "You are not a participant of this channel" },
        { status: 403 },
      );
    }

    // Update all unseen messages from the counterpart
    const result = await Message.updateMany(
      {
        channelId: new Types.ObjectId(channelId),
        senderId: { $ne: new Types.ObjectId(userId) },
        isSeen: false,
      },
      {
        $set: { isSeen: true },
      }
    );

    if (result.modifiedCount > 0) {
      // Notify the user themselves to clear their unread badge count
      if (pusherServer) {
        await pusherServer
          .trigger(getUserPusherName(userId), CHANNEL_UPDATED_EVENT, {
            channelId,
            unreadCountCleared: true,
          })
          .catch(() => {});
      }

      // Tell the other person's active chat window that the messages have been seen
      if (emitMessagesSeen) {
        await emitMessagesSeen(channelId, userId).catch(() => {});
      }
    }

    return NextResponse.json({ success: true, count: result.modifiedCount });
  } catch (error) {
    console.error("[POST /api/channels/[id]/read]", error);
    return NextResponse.json(
      { error: "Failed to mark messages as read" },
      { status: 500 },
    );
  }
}
