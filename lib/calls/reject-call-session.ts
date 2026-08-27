import "server-only";

import { logCallLifecycle } from "@/lib/call-logging";
import { getCallParticipantIds, getCallSummaryText } from "@/lib/call-utils";
import CallSession from "@/models/CallSession";
import Message from "@/models/Message";
import User from "@/models/User";
import { emitCallStatusToUser, emitChannelMessage } from "@/lib/pusher/pusherServer";
import { CALL_HANDLED_EVENT, CALL_REJECTED_EVENT } from "@/lib/pusher/events";
import type { ChatMessage } from "@/types/channel";

/**
 * The body of "the callee rejected this call", lifted out of the reject route
 * so the push-reject route can run exactly the same thing.
 *
 * Two routes reach this: POST /api/calls/[id]/reject (bearer or session auth,
 * the normal in-app decline) and POST /api/calls/[id]/push-reject (a
 * single-purpose token, used when Decline is pressed on the Android call
 * notification with no app process alive). They differ ONLY in how the actor is
 * established — everything after that has to be identical, or a call declined
 * from the notification would leave the caller ringing, skip the chat history
 * entry, or not fan out to the callee's other devices.
 *
 * Assumes the database connection is already open and that any rate limiting
 * has been applied by the caller.
 */

export type RejectCallResult =
  | { ok: true }
  | { ok: false; status: 403 | 404 | 409; error: string };

export async function rejectCallSession(params: {
  callSessionId: string;
  actingUserId: string;
  actingUserName?: string | null;
  byDeviceId?: string | null;
}): Promise<RejectCallResult> {
  const { callSessionId, actingUserId, byDeviceId = null } = params;

  const callSession = await CallSession.findById(callSessionId);
  if (!callSession) {
    return { ok: false, status: 404, error: "Call session not found" };
  }

  const { teacherId, studentId, callerId, calleeId } =
    getCallParticipantIds(callSession);

  if (actingUserId !== teacherId && actingUserId !== studentId) {
    return { ok: false, status: 403, error: "Not a participant" };
  }

  if (callerId && calleeId && actingUserId !== calleeId) {
    return {
      ok: false,
      status: 403,
      error: "Only the receiving participant can reject this call.",
    };
  }

  // Only RINGING calls can be rejected.
  //
  // This is also the idempotency guard the notification path leans on: Decline
  // there fires the JS reject (when the app is alive) AND the token-authorised
  // POST, because guessing which one will land is how a decline goes nowhere.
  // The loser of that race arrives here and is refused, which is the intent.
  if (callSession.status !== "RINGING") {
    return {
      ok: false,
      status: 409,
      error: `Call cannot be rejected (status: ${callSession.status})`,
    };
  }

  callSession.status = "REJECTED";
  callSession.endedAt = new Date();
  await callSession.save();

  // Notify the caller that the call was rejected, fan out to the callee's
  // other devices so they stop ringing, and fetch the caller's name for the
  // history message — all independent, so run them in parallel.
  const resolvedCallerId =
    callerId || (actingUserId === teacherId ? studentId : teacherId);
  const channelId = callSession.channelId.toString();
  const [, , callerUser, actingUser] = await Promise.all([
    emitCallStatusToUser(resolvedCallerId, CALL_REJECTED_EVENT, {
      callSessionId,
      channelId,
      rejectedBy: actingUserId,
    }).catch(console.error),
    emitCallStatusToUser(actingUserId, CALL_HANDLED_EVENT, {
      callSessionId,
      channelId,
      action: "rejected",
      byDeviceId,
    }).catch(console.error),
    User.findById(resolvedCallerId)
      .select("name")
      .lean<{ name?: string | null } | null>(),
    // The route may already know the actor's name; look it up only when it
    // does not, which is the push path (there is no session to read it from).
    params.actingUserName
      ? Promise.resolve({ name: params.actingUserName })
      : User.findById(actingUserId)
          .select("name")
          .lean<{ name?: string | null } | null>(),
  ]);

  const resolvedCallerName = callerUser?.name || "Unknown";
  const contentText = getCallSummaryText({
    mode: callSession.mode,
    status: "REJECTED",
  });

  const systemMsg = await Message.create({
    channelId,
    senderId: actingUserId,
    content: contentText,
    isSystemMessage: true,
    callMetadata: {
      callSessionId,
      mode: callSession.mode,
      status: "REJECTED",
      durationSeconds: null,
      callerName: resolvedCallerName,
      callerId: resolvedCallerId,
    },
    sentAt: new Date(),
  });

  const chatMessage: ChatMessage = {
    id: systemMsg._id.toString(),
    channelId,
    senderId: actingUserId,
    senderName: actingUser?.name || "Unknown",
    content: contentText,
    mediaUrl: null,
    mediaType: null,
    isSystemMessage: true,
    isOwn: false,
    isSeen: false,
    isDelivered: true,
    sentAt: systemMsg.sentAt.toISOString(),
    callInfo: {
      callSessionId,
      mode: callSession.mode,
      status: "REJECTED",
      durationSeconds: null,
      callerName: resolvedCallerName,
      callerId: resolvedCallerId,
    },
  };

  await emitChannelMessage(channelId, chatMessage).catch(console.error);

  logCallLifecycle("rejected", {
    callSessionId,
    channelId,
    callerId: resolvedCallerId,
    rejectedBy: actingUserId,
  });

  return { ok: true };
}
