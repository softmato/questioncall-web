"use client";

import { useMemo } from "react";
import { MuxPlayer } from "@/components/shared/lazy-mux-player";

import { isMuxUrl } from "@/components/shared/chat-mux-player";

/**
 * Extracts a Mux playback ID from a stream/image Mux URL (or a raw ID).
 * Kept local so this component does not depend on chat internals beyond the
 * shared `isMuxUrl` guard.
 */
function extractMuxPlaybackId(url: string): string | null {
  const streamMatch = url.match(/stream\.mux\.com\/([a-zA-Z0-9]+)/);
  if (streamMatch) return streamMatch[1];

  const imageMatch = url.match(/image\.mux\.com\/([a-zA-Z0-9]+)/);
  if (imageMatch) return imageMatch[1];

  if (/^[a-zA-Z0-9]{10,}$/.test(url)) return url;

  return null;
}

type NoticeVideoProps = {
  src: string;
  className?: string;
};

/**
 * Plays a notice video on the web. Mux HLS URLs (stream.mux.com/*.m3u8) need
 * the Mux player — a plain <video> tag can't play HLS in Chrome/Firefox.
 * Legacy Cloudinary mp4 URLs fall through to the native player.
 */
export function NoticeVideo({ src, className }: NoticeVideoProps) {
  const playbackId = useMemo(
    () => (isMuxUrl(src) ? extractMuxPlaybackId(src) : null),
    [src],
  );

  if (playbackId) {
    return (
      <MuxPlayer
        playbackId={playbackId}
        streamType="on-demand"
        className={className}
        style={
          {
            width: "100%",
            aspectRatio: "16/9",
            "--media-object-fit": "contain",
          } as any
        }
        metadata={{ video_title: "Notice video" }}
      />
    );
  }

  return <video src={src} controls playsInline className={className} />;
}
