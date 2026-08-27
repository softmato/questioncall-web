// Single source of truth for LiveKit Room options on the web client.
// Mirrored by app/lib/call-room-options.ts — keep the two in sync.
//
// Why these are set explicitly: livekit-client's stock defaults are tuned for
// multi-party rooms and are actively wrong for our 1:1 calls. Left unset they
// resolve to 720p capture, VP8, simulcast ON (180p + 360p + 720p ≈ 2.31 Mbps
// split across three layers), and degradationPreference 'balanced'. Our rooms
// are created with maxParticipants: 2 (see lib/livekit-room.ts) and both
// clients run adaptiveStream and dynacast OFF, so the two lower layers are
// encoded and uplinked but never watched — and when bandwidth estimation lands
// under ~2.3 Mbps libwebrtc culls the TOP layer first, leaving the peer looking
// at the 360p copy. That was the "video quality is way worse than WhatsApp"
// report, and it hit desktop too because home broadband upload is asymmetric.

import type { RoomOptions } from "livekit-client";

export const CALL_ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: false,
  dynacast: false,

  // Matches VideoPresets.h1080.resolution. Treated as `ideal` by
  // getUserMedia, so cameras that can't do 1080p fall back to their closest
  // supported capture format.
  videoCaptureDefaults: {
    resolution: {
      width: 1920,
      height: 1080,
      frameRate: 30,
      aspectRatio: 1920 / 1080,
    },
  },

  publishDefaults: {
    // 1:1 call with one subscriber that always wants the top layer. Extra
    // simulcast layers cost uplink + encoder CPU and buy us nothing.
    simulcast: false,
    videoEncoding: { maxBitrate: 3_000_000, maxFramerate: 30 },
    // Default for sub-1080p capture is 'balanced', which resolves CPU or
    // bandwidth pressure by downscaling and is slow to climb back. We would
    // rather hold resolution and lose some smoothness — students hold written
    // work up to the camera, so legibility beats framerate.
    degradationPreference: "maintain-resolution",
  },
};
