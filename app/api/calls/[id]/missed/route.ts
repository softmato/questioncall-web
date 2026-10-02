import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";

import { markCallSessionAsMissed } from "@/lib/call-expiration";
import { getCallParticipantIds } from "@/lib/call-utils";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/unified-auth";
import CallSession from "@/models/CallSession";

type RouteParams = { params: Promise<{ id: string }> };

const missedCallSchema = z.object({
  timedOutBy: z.enum(["caller", "callee"]).optional(),
  callerName: z.string().trim().min(1).optional(),
});

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

    const rawBody = await request.json().catch(() => ({}));
    const parsedBody = missedCallSchema.safeParse(rawBody);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsedBody.error.issues },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const callSession = await CallSession.findById(id);
    if (!callSession) {
      return NextResponse.json({ error: "Call session not found" }, { status: 404 });
    }

    const teacherId = callSession.teacherId.toString();
    const studentId = callSession.studentId.toString();
    const { callerId, calleeId } = getCallParticipantIds(callSession);

    if (userId !== teacherId && userId !== studentId) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    if (parsedBody.data.timedOutBy === "caller" && callerId && userId !== callerId) {
      return NextResponse.json(
        { error: "Only the caller can mark this call as missed from the caller side." },
        { status: 403 },
      );
    }

    if (parsedBody.data.timedOutBy === "callee" && calleeId && userId !== calleeId) {
      return NextResponse.json(
        { error: "Only the receiving participant can mark this call as missed from the callee side." },
        { status: 403 },
      );
    }

    const result = await markCallSessionAsMissed({
      callSession,
      actorUserId: userId,
      callerName: parsedBody.data.callerName,
      reason:
        parsedBody.data.timedOutBy === "callee"
          ? "callee_timeout"
          : "caller_timeout",
    });

    if (result.skipped && result.status !== "MISSED") {
      return NextResponse.json(
        { error: `Call cannot be marked missed (status: ${result.status})` },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true, status: "MISSED" });
  } catch (error) {
    console.error("[POST /api/calls/[id]/missed]", error);
    return NextResponse.json(
      { error: "Failed to mark call as missed" },
      { status: 500 },
    );
  }
}
