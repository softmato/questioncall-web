import { NextResponse } from "next/server";

import { logCallLifecycle } from "@/lib/call-logging";
import { CALL_RATE_LIMITS } from "@/lib/call-policies";
import { rejectCallSession } from "@/lib/calls/reject-call-session";
import { connectToDatabase } from "@/lib/mongodb";
import { enforceRequestRateLimit } from "@/lib/request-rate-limit";
import { getAuthenticatedUser } from "@/lib/unified-auth";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteParams) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;
    const { id } = await context.params;

    // Optional — identifies which of the callee's devices rejected, so the
    // CALL_HANDLED_EVENT fan-out can be ignored by the device that acted.
    const body = await request.json().catch(() => null);
    const byDeviceId = typeof body?.deviceId === "string" ? body.deviceId : null;

    await connectToDatabase();

    const rateLimit = await enforceRequestRateLimit({
      ...CALL_RATE_LIMITS.reject,
      userId,
      request,
    });
    if (!rateLimit.ok) {
      logCallLifecycle("rate_limited", {
        action: CALL_RATE_LIMITS.reject.action,
        userId,
        callSessionId: id,
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

    // Shared with POST /api/calls/[id]/push-reject, which authorises the actor
    // with a single-purpose token instead of a session. Everything past the
    // authorisation has to stay identical between the two.
    const result = await rejectCallSession({
      callSessionId: id,
      actingUserId: userId,
      actingUserName: user.name,
      byDeviceId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true, status: "REJECTED" });
  } catch (error) {
    console.error("[POST /api/calls/[id]/reject]", error);
    return NextResponse.json(
      { error: "Failed to reject call" },
      { status: 500 },
    );
  }
}
