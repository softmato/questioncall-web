import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { logCallLifecycle } from "@/lib/call-logging";
import { getCallParticipantIds } from "@/lib/call-utils";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/unified-auth";
import CallSession from "@/models/CallSession";
import Message from "@/models/Message";
import { emitCallStatusToUser, emitChannelMessage } from "@/lib/pusher/pusherServer";
import { CALL_CANCELLED_EVENT } from "@/lib/pusher/events";
import { sendMissedCallWebPush } from "@/lib/push/web-push";
import type { ChatMessage } from "@/types/channel";

type RouteParams = { params: Promise<{ id: string }> };

/** Caller cancels a ringing call before the other user picks up */
export async function POST(request: Request, context: RouteParams) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await connectToDatabase();

    const callSession = await CallSession.findById(id);
    if (!callSession) {
      return NextResponse.json({ error: "Call session not found" }, { status: 404 });
    }

    const { teacherId, studentId, callerId } = getCallParticipantIds(callSession);

    if (userId !== teacherId && userId !== studentId) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    if (callerId && userId !== callerId) {
      return NextResponse.json(
        { error: "Only the caller can cancel a ringing call." },
        { status: 403 },
      );
    }

    // Only RINGING calls can be cancelled
    if (callSession.status !== "RINGING") {
      return NextResponse.json(
        { error: `Call cannot be cancelled (status: ${callSession.status})` },
        { status: 409 },
      );
    }

    callSession.status = "MISSED";
    callSession.endedAt = new Date();
    await callSession.save();

    // Notify the other user that the call was cancelled
    const otherUserId = userId === teacherId ? studentId : teacherId;
    await Promise.all([
      emitCallStatusToUser(otherUserId, CALL_CANCELLED_EVENT, {
        callSessionId: id,
        channelId: callSession.channelId.toString(),
        cancelledBy: userId,
      }).catch(console.error),
      sendMissedCallWebPush(otherUserId, {
        callSessionId: id,
        channelId: callSession.channelId.toString(),
        callerName: user.name || "Someone",
        mode: callSession.mode,
      }),
    ]);

    // Insert a system message so both participants see the cancelled call in history
    const channelId = callSession.channelId.toString();
    const modeLabel = callSession.mode === "VIDEO" ? "Video" : "Audio";
    const contentText = `${modeLabel} call · Cancelled`;

    const systemMsg = await Message.create({
      channelId,
      senderId: userId,
      content: contentText,
      isSystemMessage: true,
      callMetadata: {
        callSessionId: id,
        mode: callSession.mode,
        status: "MISSED",
        durationSeconds: null,
        callerName: user.name || "Unknown",
        callerId: userId,
      },
      sentAt: new Date(),
    });

    const chatMessage: ChatMessage = {
      id: systemMsg._id.toString(),
      channelId,
      senderId: userId,
      senderName: user.name || "Unknown",
      content: contentText,
      mediaUrl: null,
      mediaType: null,
      isSystemMessage: true,
      isOwn: false,
      isSeen: false,
      isDelivered: true,
      sentAt: systemMsg.sentAt.toISOString(),
      callInfo: {
        callSessionId: id,
        mode: callSession.mode,
        status: "MISSED",
        durationSeconds: null,
        callerName: user.name || "Unknown",
        callerId: userId,
      },
    };

    await emitChannelMessage(channelId, chatMessage).catch(console.error);

    logCallLifecycle("cancelled", {
      callSessionId: id,
      channelId,
      cancelledBy: userId,
    });

    return NextResponse.json({ success: true, status: "MISSED" });
  } catch (error) {
    console.error("[POST /api/calls/[id]/cancel]", error);
    return NextResponse.json(
      { error: "Failed to cancel call" },
      { status: 500 },
    );
  }
}
