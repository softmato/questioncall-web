"use client";

import { MuxPlayer } from "@/components/shared/lazy-mux-player";

import { isMuxUrl } from "@/components/shared/chat-mux-player";
import { cn } from "@/lib/utils";
import { parseVideoSource, type VideoSourceKind } from "@/lib/video-source";

function muxPlaybackId(url: string): string | null {
  return url.match(/stream\.mux\.com\/([a-zA-Z0-9]+)/)?.[1] ?? null;
}

const ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";

export type VideoSourceStatus = {
  kind: VideoSourceKind | "empty";
  label: string;
  /** Whether this URL is safe to save (will play for users). */
  ok: boolean;
  /** A soft warning (will save, but may not play reliably). */
  warn?: boolean;
};

/** Human-readable validation status for a pasted video URL. */
export function getVideoSourceStatus(url: string | null | undefined): VideoSourceStatus {
  const trimmed = (url ?? "").trim();
  if (!trimmed) {
    return { kind: "empty", label: "Paste a video link to preview", ok: false };
  }

  const { kind } = parseVideoSource(trimmed);
  switch (kind) {
    case "youtube":
      return { kind, label: "YouTube video", ok: true };
    case "vimeo":
      return { kind, label: "Vimeo video", ok: true };
    case "loom":
      return { kind, label: "Loom video", ok: true };
    case "drive":
      return { kind, label: "Google Drive video", ok: true };
    case "file":
      return { kind, label: "Direct video file", ok: true };
    case "unsupported":
      return {
        kind,
        label: "YouTube channel/handle link — not a single video",
        ok: false,
      };
    default:
      return {
        kind,
        label: "Other web link — may not play",
        ok: true,
        warn: true,
      };
  }
}

/**
 * Renders a live, playable preview of a video URL using the same routing as the
 * user-facing players: <video> for direct files, <iframe> for provider embeds,
 * and a clear message for links that can't be played as a single video.
 */
export function VideoPreview({
  url,
  title,
  poster,
  autoPlay = false,
  className,
}: {
  url: string;
  title?: string;
  poster?: string;
  autoPlay?: boolean;
  className?: string;
}) {
  const base = cn("aspect-video w-full bg-black", className);
  const trimmed = (url ?? "").trim();
  const parsed = parseVideoSource(trimmed);

  if (!trimmed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted/40 text-sm text-muted-foreground",
          base,
        )}
      >
        Paste a video URL to preview it here.
      </div>
    );
  }

  if (parsed.kind === "unsupported") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-1 px-6 text-center",
          base,
        )}
      >
        <p className="text-sm font-semibold text-white">
          This link points to a YouTube channel, not a video.
        </p>
        <p className="text-xs text-white/60">
          Use a single video link (youtu.be/… or youtube.com/watch?v=…).
        </p>
      </div>
    );
  }

  if (parsed.kind === "file") {
    // Mux HLS (stream.mux.com/*.m3u8) can't play in a plain <video> on
    // Chrome/Firefox — use the Mux player. Plain mp4/webm fall through.
    const playbackId = isMuxUrl(parsed.url) ? muxPlaybackId(parsed.url) : null;
    if (playbackId) {
      return (
        <MuxPlayer
          playbackId={playbackId}
          streamType="on-demand"
          autoPlay={autoPlay}
          poster={poster || undefined}
          className={base}
          style={
            {
              width: "100%",
              aspectRatio: "16/9",
              "--media-object-fit": "contain",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any
          }
          metadata={{ video_title: title || "Onboarding video" }}
        />
      );
    }

    return (
      <video
        controls
        autoPlay={autoPlay}
        playsInline
        poster={poster || undefined}
        className={base}
        src={parsed.url}
      />
    );
  }

  return (
    <iframe
      src={parsed.url}
      title={title || "Video preview"}
      className={base}
      allow={ALLOW}
      allowFullScreen
    />
  );
}
