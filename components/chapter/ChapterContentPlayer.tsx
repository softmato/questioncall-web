"use client";

import { MuxPlayer } from "@/components/shared/lazy-mux-player";
import { FileTextIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ChapterContentPlayer({
  title,
  type,
  videoUrl,
  muxPlaybackId,
  fileUrl,
  fileName,
}: {
  title: string;
  type: "VIDEO" | "DOC";
  videoUrl?: string | null;
  muxPlaybackId?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
}) {
  if (type === "DOC") {
    return (
      <div className="rounded-3xl border border-border bg-background p-8 text-center shadow-sm">
        <FileTextIcon className="mx-auto size-14 text-blue-600" />
        <h1 className="mt-4 text-xl font-bold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {fileName || "Chapter document"}
        </p>
        {fileUrl ? (
          <Button asChild className="mt-6 bg-emerald-600 hover:bg-emerald-700">
            <a href={fileUrl} target="_blank" rel="noreferrer">
              Open Document
            </a>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-black shadow-sm">
      {muxPlaybackId ? (
        <MuxPlayer
          playbackId={muxPlaybackId}
          metadata={{ video_title: title }}
          className="aspect-video w-full"
          style={{ width: "100%", aspectRatio: "16/9" }}
        />
      ) : videoUrl ? (
        <video src={videoUrl} controls preload="metadata" className="aspect-video w-full" />
      ) : (
        <div className="flex aspect-video items-center justify-center text-white/70">
          Video is currently processing...
        </div>
      )}
    </div>
  );
}
