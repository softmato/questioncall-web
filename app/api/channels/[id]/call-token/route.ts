import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

import { logCallLifecycle } from "@/lib/call-logging";
import { getChannelRoomName, prepareChannelRoom } from "@/lib/livekit-room";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/unified-auth";
import Channel from "@/models/Channel";

type RouteParams = { params: Promise<{ id: string }> };

// Pre-warm token for a channel's deterministic LiveKit room. Lets the mobile
// workspace open a passive (no-publish) WebSocket to LiveKit while the user
// is just reading messages — so when they press the call button the room
// connection is already established and only track publishing remains.
export async function GET(_request: Request, context: RouteParams) {
  try {
    const user = await getAuthenticatedUser(_request);
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;
    const { id: channelId } = await context.params;
    if (!Types.ObjectId.isValid(channelId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await connectToDatabase();

    const channel = await Channel.findById(channelId)
      .select("status timerDeadline timeExtensionCount askerId acceptorId roomName")
      .lean();
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const askerId = channel.askerId.toString();
    const acceptorId = channel.acceptorId.toString();
    if (userId !== askerId && userId !== acceptorId) {
      return NextResponse.json(
        { error: "You are not a participant of this channel." },
        { status: 403 },
      );
    }

    if (channel.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Channel is not active." },
        { status: 409 },
      );
    }

    if (new Date(channel.timerDeadline).getTime() < Date.now()) {
      return NextResponse.json(
        { error: "Channel time has expired." },
        { status: 409 },
      );
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.LIVEKIT_URL;
    if (!apiKey || !apiSecret || !wsUrl) {
      return NextResponse.json(
        { error: "LiveKit not configured." },
        { status: 500 },
      );
    }

    const roomName = channel.roomName || getChannelRoomName(channelId);
    if (!channel.roomName) {
      void prepareChannelRoom(channelId);
    }
    const at = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name: user.name || "Participant",
      ttl: 7200,
    });
    at.addGrant({ roomJoin: true, room: roomName, roomRecord: false });
    const token = await at.toJwt();

    logCallLifecycle("prewarm_token_issued", {
      channelId,
      issuedTo: userId,
      roomName,
    });

    return NextResponse.json({
      token,
      serverUrl: wsUrl,
      roomName,
      channelId,
      timerDeadline: new Date(channel.timerDeadline).toISOString(),
      timeExtensionCount: channel.timeExtensionCount ?? 0,
    });
  } catch (error) {
    console.error("[GET /api/channels/[id]/call-token]", error);
    return NextResponse.json(
      { error: "Failed to issue pre-warm token" },
      { status: 500 },
    );
  }
}
