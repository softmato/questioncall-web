import { NextResponse } from "next/server";

import { logCallLifecycle } from "@/lib/call-logging";
import { CALL_RATE_LIMITS } from "@/lib/call-policies";
import { getCallParticipantIds } from "@/lib/call-utils";
import { rejectCallSession } from "@/lib/calls/reject-call-session";
import { verifyCallPushActionToken } from "@/lib/calls/push-action-token";
import { connectToDatabase } from "@/lib/mongodb";
import { enforceRequestRateLimit } from "@/lib/request-rate-limit";
import CallSession from "@/models/CallSession";

/**
 * Decline an incoming call using the single-purpose token that rode in on the
 * call push, rather than a session.
 *
 * This exists because of where Decline is pressed on Android: a
 * BroadcastReceiver on a process that FCM woke purely to draw the notification.
 * There is no React runtime there and therefore no bearer token, so before this
 * route the only thing Decline could do was silence the callee's own device —
 * the caller kept ringing to the RINGING timeout and the ring-fallback tier
 * re-pushed the same call seconds later, because as far as the server was
 * concerned nobody had answered.
 *
 * Why this is not an authentication hole:
 *   - the token is HMAC'd with NEXTAUTH_SECRET over (action, call id, user id,
 *     expiry) and is only ever handed to that call's callee, in that call's own
 *     push;
 *   - it authorises one action on one call session and expires in minutes;
 *   - the checks in rejectCallSession still run in full — participant, callee,
 *     and RINGING-only — so a valid token for a call that has been answered,
 *     cancelled or already rejected does nothing.
 *
 * The 409 on a non-RINGING call is load-bearing rather than an error case: the
 * client deliberately fires both this and the in-app reject when it cannot tell
 * whether JS is alive, and one of them is expected to lose.
 */

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteParams) {
  try {
    const { id } = await context.params;

    // Rate limit before touching the database: this route is reachable without
    // a session, so the unauthenticated path must not be a free read.
    const ipLimit = await enforceRequestRateLimit({
      ...CALL_RATE_LIMITS.reject,
      action: `${CALL_RATE_LIMITS.reject.action}:push`,
      request,
    });
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: ipLimit.error },
        {
          status: 429,
          headers: { "Retry-After": String(ipLimit.retryAfterSeconds) },
        },
      );
    }

    const body = (await request.json().catch(() => null)) as {
      token?: unknown;
      deviceId?: unknown;
    } | null;

    const token = typeof body?.token === "string" ? body.token : null;
    const byDeviceId = typeof body?.deviceId === "string" ? body.deviceId : null;

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    await connectToDatabase();

    const callSession = await CallSession.findById(id)
      .select("teacherId studentId callerId")
      .lean<{
        teacherId: unknown;
        studentId: unknown;
        callerId?: unknown;
      } | null>();
    if (!callSession) {
      return NextResponse.json({ error: "Call session not found" }, { status: 404 });
    }

    // The token is verified against the callee resolved here, so nothing about
    // who is acting comes from the request itself. No callee means the session
    // predates callerId and there is nobody this token could have been minted
    // for — refuse rather than guess.
    const { calleeId } = getCallParticipantIds(
      callSession as Parameters<typeof getCallParticipantIds>[0],
    );
    if (!calleeId) {
      return NextResponse.json(
        { error: "Call session has no resolvable callee" },
        { status: 409 },
      );
    }
    const expectedUserId = calleeId;

    const verified = verifyCallPushActionToken(token, "reject", id, expectedUserId);
    if (!verified.ok) {
      logCallLifecycle("push_reject_rejected", {
        callSessionId: id,
        reason: verified.reason,
      });
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const result = await rejectCallSession({
      callSessionId: id,
      actingUserId: verified.userId,
      byDeviceId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    logCallLifecycle("push_reject_accepted", { callSessionId: id });

    return NextResponse.json({ success: true, status: "REJECTED" });
  } catch (error) {
    console.error("[POST /api/calls/[id]/push-reject]", error);
    return NextResponse.json({ error: "Failed to reject call" }, { status: 500 });
  }
}
