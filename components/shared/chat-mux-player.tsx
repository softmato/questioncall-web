"use client";

import { useMemo } from "react";
import { MuxPlayer } from "@/components/shared/lazy-mux-player";

/**
 * Extracts a Mux playback ID from a Mux URL.
 *
 * Supported formats:
 *  - https://stream.mux.com/{playbackId}.m3u8
 *  - https://image.mux.com/{playbackId}/thumbnail.webp
 *  - Just the raw playbackId
 */
function extractMuxPlaybackId(url: string): string | null {
  // stream.mux.com/{id}.m3u8
  const streamMatch = url.match(/stream\.mux\.com\/([a-zA-Z0-9]+)/);
  if (streamMatch) return streamMatch[1];

  // image.mux.com/{id}/
  const imageMatch = url.match(/image\.mux\.com\/([a-zA-Z0-9]+)/);
  if (imageMatch) return imageMatch[1];

  // If it looks like a raw playback ID (no slashes, no dots except extension)
  if (/^[a-zA-Z0-9]{10,}$/.test(url)) return url;

  return null;
}

/** Check if a media URL is a Mux URL */
export function isMuxUrl(url: string): boolean {
  return url.includes("stream.mux.com") || url.includes("image.mux.com");
}

// ── Chat Video Player (Mux) ───────────────────────────────────────────────

type ChatMuxVideoPlayerProps = {
  src: string;
  className?: string;
};

/**
 * Compact Mux video player for chat messages.
 * Accepts a Mux HLS URL and renders the official MuxPlayer with
 * a minimal, chat-friendly UI.
 */
export function ChatMuxVideoPlayer({ src, className }: ChatMuxVideoPlayerProps) {
  const playbackId = useMemo(() => extractMuxPlaybackId(src), [src]);

  if (!playbackId) {
    // Fallback to native video if we can't extract a Mux ID
    return (
      <video
        src={src}
        controls
        className={className}
      />
    );
  }

  return (
    <MuxPlayer
      playbackId={playbackId}
      streamType="on-demand"
      className={className}
      style={{
        width: "100%",
        maxWidth: "18rem",
        aspectRatio: "16/9",
        borderRadius: "0.75rem",
        overflow: "hidden",
        "--media-object-fit": "cover",
      } as any}
      metadata={{
        video_title: "Chat video",
      }}
    />
  );
}

// ── Chat Audio Player (Mux) ───────────────────────────────────────────────

type ChatMuxAudioPlayerProps = {
  src: string;
};

/**
 * Compact Mux audio player for chat voice messages.
 * Uses MuxPlayer in audio-only mode with a minimal waveform-style UI.
 */
export function ChatMuxAudioPlayer({ src }: ChatMuxAudioPlayerProps) {
  const playbackId = useMemo(() => extractMuxPlaybackId(src), [src]);

  if (!playbackId) {
    // Fallback to native audio
    return <audio src={src} controls className="w-full max-w-[240px]" />;
  }

  return (
    <MuxPlayer
      playbackId={playbackId}
      streamType="on-demand"
      audio
      className="w-full min-w-[200px] sm:min-w-[240px]"
      style={{
        minHeight: "40px",
        maxHeight: "48px",
      } as any}
      metadata={{
        video_title: "Voice message",
      }}
    />
  );
}
