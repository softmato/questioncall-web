import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

import { logCallLifecycle } from "@/lib/call-logging";
import { canIssueCallToken } from "@/lib/call-utils";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/unified-auth";
import CallSession from "@/models/CallSession";
import Channel from "@/models/Channel";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteParams) {
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

    const callSession = await CallSession.findById(id).lean();
    if (!callSession) {
      return NextResponse.json({ error: "Call session not found" }, { status: 404 });
    }

    const channel = await Channel.findById(callSession.channelId)
      .select("status timerDeadline timeExtensionCount")
      .lean();
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    if (channel.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "This channel is no longer active." },
        { status: 409 },
      );
    }

    if (callSession.status === "ENDED" || callSession.status === "REJECTED" || callSession.status === "MISSED") {
      return NextResponse.json({ error: "Call has already ended." }, { status: 403 });
    }

    const callerId = callSession.callerId?.toString() ?? null;

    if (!canIssueCallToken(callSession.status, userId, callerId)) {
      logCallLifecycle("token_blocked", {
        callSessionId: id,
        channelId: callSession.channelId.toString(),
        requestedBy: userId,
        status: callSession.status,
      });
      return NextResponse.json(
        { error: "Call has not been accepted yet." },
        { status: 409 },
      );
    }

    const teacherId = callSession.teacherId.toString();
    const studentId = callSession.studentId.toString();

    if (userId !== teacherId && userId !== studentId) {
      return NextResponse.json({ error: "You are not a participant in this call." }, { status: 403 });
    }

    const participantName = userId === teacherId ? "Teacher" : "Student";

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !wsUrl) {
      throw new Error("LiveKit credentials not configured. Please check your environment variables.");
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name: user.name || participantName,
      ttl: 7200, // 2 hours in seconds
    });
    
    // In our v1 we just allow audio/video, and the client UI determines camera initial state.
    // roomRecord: false ensures P2P calls cannot be recorded by participants.
    at.addGrant({ roomJoin: true, room: callSession.roomName, roomRecord: false });

    const token = await at.toJwt();

    logCallLifecycle("token_issued", {
      callSessionId: id,
      channelId: callSession.channelId.toString(),
      issuedTo: userId,
      roomName: callSession.roomName,
    });

    return NextResponse.json({
      token,
      serverUrl: wsUrl,
      channelId: callSession.channelId.toString(),
      timerDeadline: new Date(channel.timerDeadline).toISOString(),
      timeExtensionCount: channel.timeExtensionCount ?? 0,
    });
  } catch (error) {
    console.error("[GET /api/calls/[id]/token]", error);
    return NextResponse.json(
      { error: "Failed to generate access token" },
      { status: 500 }
    );
  }
}
