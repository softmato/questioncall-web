import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/unified-auth";
import { emitDeadlineWarningIfNeeded } from "@/lib/channel-deadline-warning";
import { processExpiredChannels } from "@/lib/channel-expiration";
import { connectToDatabase } from "@/lib/mongodb";
import { emitChannelMessage, pusherServer } from "@/lib/pusher/pusherServer";
import { getUserPusherName, CHANNEL_UPDATED_EVENT } from "@/lib/pusher/events";
import { sendPushNotificationToUser } from "@/lib/push/web-push";
import Channel from "@/models/Channel";
import Message, { MESSAGE_MEDIA_TYPES } from "@/models/Message";
import Answer from "@/models/Answer";
import type { ChatMessage, SendMessagePayload } from "@/types/channel";

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
    let channel = await Channel.findById(channelId).lean();
    
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

    if (channel.status === "ACTIVE") {
      const timerDeadlineMs = new Date(channel.timerDeadline).getTime();
      if (timerDeadlineMs <= Date.now()) {
        await processExpiredChannels({ channelId });
        channel = await Channel.findById(channelId).lean();

        if (!channel) {
          return NextResponse.json({ error: "Channel not found" }, { status: 404 });
        }
      }
    }

    // Channel must be ACTIVE to send messages
    if (channel.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "This channel is no longer active" },
        { status: 409 },
      );
    }

    const hasAnswerSubmitted = await Answer.exists({ channelId });
    await emitDeadlineWarningIfNeeded({
      channelId,
      acceptorId,
      status: channel.status,
      timerDeadline: channel.timerDeadline,
      hasAnswerSubmitted: Boolean(hasAnswerSubmitted),
    });

    const body = (await request.json()) as SendMessagePayload;

    // Must have content or media
    if (!body.content?.trim() && !body.mediaUrl) {
      return NextResponse.json(
        { error: "Message must have content or media" },
        { status: 400 },
      );
    }

    // Media must already be uploaded: a device-local path (a failed upload
    // retried as-is) saved a message nobody else could open.
    if (body.mediaUrl && !/^https:\/\//i.test(body.mediaUrl)) {
      return NextResponse.json({ error: "Media must be uploaded first." }, { status: 400 });
    }
    const mediaType = body.mediaType ? body.mediaType.toUpperCase() : null;
    if (mediaType && !(MESSAGE_MEDIA_TYPES as readonly string[]).includes(mediaType)) {
      return NextResponse.json({ error: "Unsupported media type." }, { status: 400 });
    }

    // Save message
    const message = await Message.create({
      channelId,
      senderId: userId,
      content: body.content?.trim() || "",
      mediaUrl: body.mediaUrl || null,
      mediaType,
      mediaPublicId: body.mediaPublicId || null,
      isSeen: false,
      isDelivered: true,
      sentAt: new Date(),
    });

    const chatMessage: ChatMessage = {
      id: message._id.toString(),
      channelId,
      senderId: userId,
      senderName: user.name || "Unknown",
      content: message.content,
      mediaUrl: message.mediaUrl,
      mediaType: message.mediaType,
      isSystemMessage: false,
      isOwn: false, // Will be set correctly on the receiving end
      isSeen: false,
      isDelivered: true,
      sentAt: message.sentAt.toISOString(),
    };

    const counterpartId = userId === askerId ? acceptorId : askerId;

    // Run Pusher + push notification in parallel; both must complete before
    // the serverless function returns or the push will be killed mid-flight.
    const rawPreview = chatMessage.content || "";
    const preview = rawPreview.length > 0
      ? rawPreview.substring(0, 100) + (rawPreview.length > 100 ? "…" : "")
      : "Sent a media message";

    console.log(`[messages] Sending push to counterpart=${counterpartId} from=${userId}`);

    const results = await Promise.allSettled([
      emitChannelMessage(channelId, chatMessage),
      pusherServer?.trigger(getUserPusherName(counterpartId), CHANNEL_UPDATED_EVENT, {
        channelId,
        lastMessagePreview: chatMessage.content.substring(0, 80) || "Media message",
        lastMessageAt: chatMessage.sentAt,
        unreadCountIncrement: 1,
      }),
      sendPushNotificationToUser(counterpartId, {
        type: "CHAT_MESSAGE",
        title: user.name || "QuestionCall",
        message: preview,
        href: `/workspace/${channelId}`,
      }),
    ]);

    const [pusherResult, channelUpdateResult, pushResult] = results;
    if (pushResult.status === "rejected") {
      console.error("[messages] Push notification FAILED:", pushResult.reason);
    } else {
      console.log("[messages] Push notification sent OK");
    }

    // Return the message with isOwn = true for the sender
    return NextResponse.json({ ...chatMessage, isOwn: true }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/channels/[id]/messages]", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 },
    );
  }
}
