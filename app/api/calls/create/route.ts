import { after, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

import { logCallLifecycle } from "@/lib/call-logging";
import { CALL_RATE_LIMITS } from "@/lib/call-policies";
import { createCallPushActionToken } from "@/lib/calls/push-action-token";
import { processExpiredChannels } from "@/lib/channel-expiration";
import { getChannelRoomName, prepareChannelRoom } from "@/lib/livekit-room";
import { connectToDatabase } from "@/lib/mongodb";
import { enforceRequestRateLimit } from "@/lib/request-rate-limit";
import { sendPushNotificationToUser } from "@/lib/push/web-push";
import { getSiteUrl } from "@/lib/site-url";
import { getAuthenticatedUser } from "@/lib/unified-auth";
import Channel from "@/models/Channel";
import CallSession from "@/models/CallSession";
import User from "@/models/User";

/**
 * How long to wait before falling back to a system-rendered call notification.
 *
 * Long enough that a device which *can* raise the full-screen ring has already
 * done so and moved the session out of CREATED/RINGING (Pusher usually wins in
 * well under a second, FCM within two), short enough that a callee on an OEM
 * that blocked the ring is not left staring at a silent phone.
 */
const RING_FALLBACK_DELAY_MS = 5000;

// after() runs on the same invocation, so the fallback's delay counts toward
// this route's wall clock. Default (10s) leaves no headroom above the 5s wait
// plus the LiveKit/Mongo/Pusher work before it.
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;

    const { channelId, mode } = await request.json();
    if (!channelId || !mode) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (mode !== "AUDIO" && mode !== "VIDEO") {
      return NextResponse.json({ error: "Invalid call mode" }, { status: 400 });
    }

    await connectToDatabase();

    const rateLimit = await enforceRequestRateLimit({
      ...CALL_RATE_LIMITS.create,
      userId,
      request,
    });
    if (!rateLimit.ok) {
      logCallLifecycle("rate_limited", {
        action: CALL_RATE_LIMITS.create.action,
        userId,
      });
      return NextResponse.json(
        { error: rateLimit.error },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }

    let channel = await Channel.findById(channelId)
      .select("status timerDeadline timeExtensionCount askerId acceptorId roomName")
      .lean();
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const askerId = channel.askerId.toString();
    const acceptorId = channel.acceptorId.toString();

    if (userId !== askerId && userId !== acceptorId) {
      return NextResponse.json({ error: "You are not a participant of this channel." }, { status: 403 });
    }

    if (channel.status === "ACTIVE") {
      const timerDeadlineMs = new Date(channel.timerDeadline).getTime();
      if (timerDeadlineMs <= Date.now()) {
        await processExpiredChannels({ channelId });
        channel = await Channel.findById(channelId)
          .select("status timerDeadline timeExtensionCount askerId acceptorId roomName")
          .lean();

        if (!channel) {
          return NextResponse.json({ error: "Channel not found" }, { status: 404 });
        }
      }
    }

    if (channel.status !== "ACTIVE") {
      return NextResponse.json({ error: "Channel is not active. Call cannot be started." }, { status: 403 });
    }

    if (new Date(channel.timerDeadline).getTime() < Date.now()) {
      return NextResponse.json({ error: "Channel time has expired." }, { status: 403 });
    }

    // acceptorId is considered the teacher, askerId is the student
    const teacherId = acceptorId;
    const studentId = askerId;

    // Deterministic room name per channel — shared across every call in the
    // channel so clients can pre-warm a LiveKit connection in the workspace
    // before any call is initiated. Stored on the Channel doc at accept time;
    // fall back to the deterministic value for legacy channels that predate
    // that field, and self-heal by kicking off room prep async.
    const roomName = channel.roomName || getChannelRoomName(channelId);
    if (!channel.roomName) {
      void prepareChannelRoom(channelId);
    }
    const otherUserId = userId === askerId ? acceptorId : askerId;

    // Issue LiveKit tokens for BOTH participants up-front. The callee token
    // travels in the Pusher payload so they can pre-warm the room while the
    // ringtone plays — eliminating the GET /token round-trip on accept.
    // Declared before the idempotency guard below, which mints a token too.
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.LIVEKIT_URL;
    const livekitConfigured = Boolean(apiKey && apiSecret && wsUrl);

    async function mintToken(identity: string, displayName: string) {
      if (!livekitConfigured) return null;
      const at = new AccessToken(apiKey!, apiSecret!, {
        identity,
        name: displayName,
        ttl: 7200,
      });
      at.addGrant({ roomJoin: true, room: roomName, roomRecord: false });
      return at.toJwt();
    }

    // ── Idempotency guard ────────────────────────────────────────────────────
    // Never let a channel accumulate more than one live call. A client that
    // dials twice (a remount re-running the caller bootstrap, a retried
    // request, a double tap) must get the call it already started back —
    // creating a second session re-rings the callee and orphans the first.
    // Reuse is deliberately bounded: only calls still ringing recently, or one
    // that is genuinely ACTIVE, can be handed back.
    const RING_REUSE_WINDOW_MS = 60_000;
    const liveCall = await CallSession.findOne({
      channelId,
      status: { $in: ["RINGING", "ACTIVE"] },
    })
      .sort({ createdAt: -1 })
      .select("callerId mode status roomName teacherId studentId createdAt")
      .lean();

    if (liveCall) {
      const liveCallerId = liveCall.callerId?.toString() ?? null;
      const liveCallId = liveCall._id.toString();
      const isSameCaller = liveCallerId === userId;
      const isFresh =
        liveCall.status === "ACTIVE" ||
        Date.now() - new Date(liveCall.createdAt).getTime() < RING_REUSE_WINDOW_MS;

      if (!isSameCaller && isFresh) {
        // The other participant is already calling us (or we are already in a
        // call together). Stacking a second session here is what produces two
        // simultaneous ringing calls between the same two people.
        logCallLifecycle("create_rejected_busy", {
          callSessionId: liveCallId,
          channelId,
          callerId: userId,
          calleeId: otherUserId,
        });
        return NextResponse.json(
          {
            error:
              liveCall.status === "ACTIVE"
                ? "This channel already has a call in progress."
                : "They are calling you right now — answer that call instead.",
            callSessionId: liveCallId,
            reason: "BUSY",
          },
          { status: 409 },
        );
      }

      if (isSameCaller && isFresh) {
        // Same caller, same channel, call still live: hand back the ORIGINAL
        // session with a fresh token. Deliberately no Pusher emit and no push
        // — the callee is already ringing for this exact session, and
        // re-emitting would ring them a second time.
        const existingToken = await mintToken(userId, user.name || "Caller");
        logCallLifecycle("create_deduped", {
          callSessionId: liveCallId,
          channelId,
          callerId: userId,
          calleeId: otherUserId,
          status: liveCall.status,
        });
        return NextResponse.json(
          {
            callSessionId: liveCallId,
            channelId,
            roomName: liveCall.roomName,
            mode: liveCall.mode,
            callerId: userId,
            teacherId: liveCall.teacherId?.toString() ?? teacherId,
            studentId: liveCall.studentId?.toString() ?? studentId,
            calleeIsOnline: true,
            status: liveCall.status,
            token: existingToken,
            serverUrl: wsUrl || null,
            timerDeadline: new Date(channel.timerDeadline).toISOString(),
            timeExtensionCount: channel.timeExtensionCount ?? 0,
            deduped: true,
          },
          { status: 200 },
        );
      }
    }

    const newCallPromise = CallSession.create({
      channelId,
      roomName,
      teacherId,
      studentId,
      callerId: userId,
      mode,
      status: "RINGING",
    });

    const callerUserPromise = User.findById(userId).select("userImage name").lean();
    // Fetch the callee's presence so the caller's outgoing screen can show
    // "Ringing…" (callee online, their device should be ringing) vs "Calling…"
    // (callee offline/disconnected — only the push wake-up will reach them).
    const calleeUserPromise = User.findById(otherUserId)
      .select("lastActiveAt")
      .lean();

    const [newCall, callerUser, calleeUser, callerToken, calleeToken] =
      await Promise.all([
        newCallPromise,
        callerUserPromise,
        calleeUserPromise,
        mintToken(userId, user.name || "Caller"),
        mintToken(otherUserId, "Callee"),
      ]);

    const callerImage = callerUser?.userImage || null;
    const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
    const calleeIsOnline = calleeUser?.lastActiveAt
      ? Date.now() - new Date(calleeUser.lastActiveAt).getTime() < ONLINE_THRESHOLD_MS
      : false;
    const callSessionId = newCall._id.toString();
    const timerDeadlineIso = new Date(channel.timerDeadline).toISOString();
    const timeExtensionCount = channel.timeExtensionCount ?? 0;

    const { emitIncomingCall } = await import("@/lib/pusher/pusherServer");

    // Pusher is awaited — if it fails the callee never rings, which we want
    // surfaced as an error. The push notification is fire-and-forget; it's a
    // wake-up signal not a correctness requirement.
    await emitIncomingCall(otherUserId, {
      callSessionId,
      channelId,
      callerName: user.name || "A user",
      callerImage,
      callerId: userId,
      mode: mode as "AUDIO" | "VIDEO",
      token: calleeToken,
      serverUrl: wsUrl || null,
      timerDeadline: timerDeadlineIso,
      timeExtensionCount,
    });

    // Lets the callee decline from the Android call notification when there is
    // no app process to hold a bearer token — see lib/calls/push-action-token.
    // Null when the secret is missing: the call must still ring, and the client
    // degrades to silencing itself and letting the session time out.
    const declineToken = createCallPushActionToken("reject", callSessionId, otherUserId);
    const declineExtras: Record<string, string> = declineToken
      ? {
          declineToken,
          declineUrl: `${getSiteUrl()}/api/calls/${callSessionId}/push-reject`,
        }
      : {};

    void sendPushNotificationToUser(otherUserId, {
      type: "SYSTEM",
      title: user.name || "Incoming Call",
      message: mode === "VIDEO" ? "📹 Video call" : "📞 Audio call",
      href: `/call/${callSessionId}`,
      icon: callerImage,
      extraData: {
        callSessionId,
        callerId: userId,
        callerName: user.name || "Someone",
        mode,
        ...declineExtras,
      },
    }).catch((err) => {
      console.warn("[calls/create] push notification failed:", err);
    });

    // ── Ring fallback tier ──────────────────────────────────────────────────
    // The push above is data-only, which is what lets CallNotificationService
    // raise the real full-screen ring on a killed app. Its unadvertised
    // dependency: a data-only message renders nothing by itself, so the OS has
    // to start our process for it to do anything at all. Aggressive OEMs
    // (Infinix/XOS, Xiaomi, Oppo, Vivo, Tecno, Realme) refuse that start after
    // a swipe from recents — and because the service's own fallback
    // notification lives *inside* onMessageReceived, it never runs either. The
    // callee gets absolute silence, which is how this shipped.
    //
    // Since CallNotificationService started overriding handleIntent, this tier
    // is no longer only a plain notification: if our process comes up at all,
    // the app claims this push before Firebase draws it and raises the proper
    // CallStyle ring instead — or drops it silently when the primary already
    // surfaced the call. Firebase's flat rendering is now the floor, not the
    // ceiling.
    //
    // So if the call is still unanswered a few seconds on, re-send it as an
    // ordinary notification-payload push. The FCM SDK draws those with no
    // process start required (the same path chat notifications already arrive
    // on, confirmed working on the problem device), and the calls_v2 channel
    // supplies the real ringtone, MAX importance, DND bypass and lock-screen
    // visibility. Worst case degrades from "nothing at all" to "a ringing
    // notification you tap to answer".
    //
    // Devices where the ring worked mostly never reach the send: answering or
    // declining moves the session out of CREATED/RINGING. One still slips
    // through whenever the callee simply has not picked up yet — 5s into a 30s
    // ring is the normal case, not an edge case — and CallDispatchStore.claim()
    // is what keeps that from becoming a second tray entry beside a ring that
    // is already going. That only holds because handleIntent routes this tier
    // through the same claim; before it did, the duplicate was drawn by
    // Firebase where no client-side dedupe could reach it.
    after(async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, RING_FALLBACK_DELAY_MS));

        const current = await CallSession.findById(callSessionId)
          .select("status")
          .lean<{ status: string } | null>();

        if (!current || (current.status !== "CREATED" && current.status !== "RINGING")) {
          return;
        }

        // The body names the caller on purpose, even though the title already
        // does: some OEM lock screens show only the body in compact form, and
        // this notification may be the callee's ONLY surface for the call.
        const fallbackCallerName = user.name || "Someone";
        await sendPushNotificationToUser(otherUserId, {
          type: "SYSTEM",
          title: user.name || "Incoming Call",
          message:
            mode === "VIDEO"
              ? `📹 ${fallbackCallerName} is video calling you — tap to answer`
              : `📞 ${fallbackCallerName} is calling you — tap to answer`,
          href: `/call/${callSessionId}`,
          icon: callerImage,
          // The whole point of this tier — see web-push.ts.
          forceSystemRendered: true,
          extraData: {
            callSessionId,
            callerId: userId,
            callerName: user.name || "Someone",
            mode,
            // Same token as the primary — still inside its TTL at this point,
            // and this tier is often the ONLY push that reaches the device, so
            // the notification it produces must be just as answerable.
            ...declineExtras,
          },
        });

        logCallLifecycle("ring_fallback_sent", {
          callSessionId,
          channelId,
          calleeId: otherUserId,
          afterMs: RING_FALLBACK_DELAY_MS,
        });
      } catch (err) {
        // Never let the fallback surface as a call failure — the primary push
        // and Pusher emit have both already gone out by this point.
        console.warn("[calls/create] ring fallback push failed:", err);
      }
    });

    logCallLifecycle("created", {
      callSessionId,
      channelId,
      callerId: userId,
      calleeId: otherUserId,
      mode,
      callerHasAvatar: Boolean(callerImage),
    });

    return NextResponse.json(
      {
        callSessionId,
        channelId,
        roomName,
        mode,
        callerId: userId,
        teacherId,
        studentId,
        calleeIsOnline,
        status: "RINGING",
        token: callerToken,
        serverUrl: wsUrl || null,
        timerDeadline: timerDeadlineIso,
        timeExtensionCount,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/calls/create]", error);
    return NextResponse.json(
      { error: "Failed to create call session" },
      { status: 500 }
    );
  }
}
