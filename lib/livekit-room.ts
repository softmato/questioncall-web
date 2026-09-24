import { RoomServiceClient } from "livekit-server-sdk";

import Channel from "@/models/Channel";

export function getChannelRoomName(channelId: string): string {
  return `channel_${channelId}`;
}

function getRoomServiceClient(): RoomServiceClient | null {
  const wsUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!wsUrl || !apiKey || !apiSecret) return null;
  // RoomServiceClient speaks HTTPS to the SFU's REST API, while LIVEKIT_URL
  // is the wss endpoint clients use. Same host, different scheme.
  const httpUrl = wsUrl.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
  return new RoomServiceClient(httpUrl, apiKey, apiSecret);
}

/**
 * Which of these users are actually in the call right now.
 *
 * The server has no other way to know. POST /calls/:id/end is the only thing
 * that moves a call out of ACTIVE, and it only runs while an app is alive to
 * run it — force-stop, swipe-away, or an OEM task killer all skip it and leave
 * the session ACTIVE for ever, which makes /calls/create refuse every later
 * call on that channel ("This channel already has a call in progress.").
 *
 * A client heartbeat looks like the obvious fix and is not: React Native pauses
 * JS timers when the Android activity backgrounds, so locking the phone during
 * a voice call would stop the heartbeat and kill a live call. The SFU already
 * knows exactly who is connected, so ask it.
 *
 * Presence alone is not enough, though — clients pre-warm a connection to the
 * channel room from the chat screen and while ringing, without publishing
 * anything. Only a participant publishing a track is in a call.
 *
 * Returns null when the answer is unknown (LiveKit unconfigured, or the API
 * failed); callers must treat that as "assume still live" rather than reaping.
 * A room that no longer exists is a definite answer: nobody is in it.
 */
export async function getParticipantsInCall(
  roomName: string,
  identities: string[],
): Promise<Set<string> | null> {
  const client = getRoomServiceClient();
  if (!client) return null;

  let participants;
  try {
    participants = await client.listParticipants(roomName);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not_?found|does not exist/i.test(message)) return new Set();
    console.warn("[livekit] listParticipants failed:", message);
    return null;
  }

  const wanted = new Set(identities.filter(Boolean));
  return new Set(
    participants
      .filter((p) => wanted.has(p.identity) && p.tracks.length > 0)
      .map((p) => p.identity),
  );
}

// Fire-and-forget: pre-allocate the LiveKit room on the SFU and persist the
// roomName on the Channel doc. Safe to call multiple times — LiveKit returns
// the existing room if it's already created. Never throws; callers should
// invoke with `void`.
export async function prepareChannelRoom(channelId: string): Promise<void> {
  const roomName = getChannelRoomName(channelId);

  const persist = Channel.updateOne(
    { _id: channelId, roomName: null },
    { $set: { roomName } },
  ).catch((err) => {
    console.warn("[livekit] persist roomName failed:", err);
  });

  const client = getRoomServiceClient();
  const provision = client
    ? client
        .createRoom({
          name: roomName,
          emptyTimeout: 5 * 60,
          maxParticipants: 2,
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          if (!/already exists/i.test(message)) {
            console.warn("[livekit] createRoom failed:", message);
          }
        })
    : Promise.resolve();

  await Promise.allSettled([persist, provision]);
}
