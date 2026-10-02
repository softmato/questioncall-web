import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/unified-auth";
import CallSession from "@/models/CallSession";
import User from "@/models/User";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteParams) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await connectToDatabase();

    const callSession = await CallSession.findById(id)
      .select("channelId teacherId studentId callerId status mode roomName startedAt endedAt")
      .lean();

    if (!callSession) {
      return NextResponse.json({ error: "Call session not found" }, { status: 404 });
    }

    const teacherId = callSession.teacherId.toString();
    const studentId = callSession.studentId.toString();

    if (user.id !== teacherId && user.id !== studentId) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    const [teacher, student] = await Promise.all([
      User.findById(teacherId).select("name image").lean(),
      User.findById(studentId).select("name image").lean(),
    ]);

    return NextResponse.json({
      callSessionId: id,
      channelId: callSession.channelId.toString(),
      teacherId,
      studentId,
      callerId: callSession.callerId?.toString() ?? null,
      status: callSession.status,
      mode: callSession.mode,
      roomName: callSession.roomName,
      startedAt: callSession.startedAt ?? null,
      endedAt: callSession.endedAt ?? null,
      teacherName: (teacher as any)?.name ?? null,
      studentName: (student as any)?.name ?? null,
      teacherImage: (teacher as any)?.image ?? null,
      studentImage: (student as any)?.image ?? null,
    });
  } catch (error) {
    console.error("[GET /api/calls/[id]]", error);
    return NextResponse.json({ error: "Failed to get call session" }, { status: 500 });
  }
}
