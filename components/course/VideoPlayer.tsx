"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MuxPlayer } from "@/components/shared/lazy-mux-player";

import { Progress } from "@/components/ui/progress";

type VideoPlayerProps = {
  videoUrl?: string | null;
  muxPlaybackId?: string | null;
  title: string;
  courseId: string;
  videoId: string;
  initialWatchedPercent?: number;
  isPreview?: boolean;
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function VideoPlayer({
  videoUrl,
  muxPlaybackId,
  title,
  courseId,
  videoId,
  initialWatchedPercent = 0,
  isPreview = false,
}: VideoPlayerProps) {
  const [watchedPercent, setWatchedPercent] = useState(
    clamp(initialWatchedPercent),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  
  const saveEndpoint = useMemo(
    () => `/api/courses/${courseId}/videos/${videoId}/progress`,
    [courseId, videoId],
  );

  useEffect(() => {
    if (isPreview) {
      return;
    }

    let isCancelled = false;

    const persistProgress = async (percent: number, silent = true) => {
      try {
        setIsSaving(true);
        const response = await fetch(saveEndpoint, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            watchedPercent: Math.round(clamp(percent)),
          }),
        });

        if (!response.ok && !silent) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to save progress.");
        }
      } catch (error) {
        if (!silent && !isCancelled) {
          toast.error(
            error instanceof Error ? error.message : "Failed to save progress.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsSaving(false);
        }
      }
    };

    const interval = window.setInterval(() => {
      if (!isPlaying || isEnded) {
        return;
      }

      void persistProgress(watchedPercent);
    }, 30000);

    return () => {
      isCancelled = true;
      window.clearInterval(interval);
    };
  }, [saveEndpoint, watchedPercent, isPlaying, isEnded, isPreview]);

  const persistFinalProgress = async () => {
    if (isPreview) {
      return;
    }

    try {
      setIsSaving(true);
      await fetch(saveEndpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchedPercent: 100 }),
      });
    } catch {
      // Ignored on auto end
    } finally {
      setIsSaving(false);
    }
  };

  const handleTimeUpdate = (e: Event) => {
    const video = e.target as HTMLVideoElement;
    if (Number.isFinite(video.duration) && video.duration > 0) {
      setWatchedPercent(clamp((video.currentTime / video.duration) * 100));
    }
  };

  const handleLoadedMetadata = (e: Event) => {
    const video = e.target as HTMLVideoElement;
    if (
      initialWatchedPercent > 1 &&
      initialWatchedPercent < 95 &&
      Number.isFinite(video.duration) &&
      video.duration > 0
    ) {
      video.currentTime = (video.duration * initialWatchedPercent) / 100;
    }
  };

  const handleEnded = () => {
    setIsEnded(true);
    setIsPlaying(false);
    setWatchedPercent(100);
    void persistFinalProgress();
  };

  return (
    <div className="space-y-4 rounded-3xl border border-border bg-background p-4 shadow-sm">
      <div className="overflow-hidden rounded-2xl bg-black">
        {muxPlaybackId ? (
          <MuxPlayer
            playbackId={muxPlaybackId}
            metadata={{ video_title: title }}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            className="aspect-video w-full"
            style={{ width: "100%", aspectRatio: "16/9" }}
          />
        ) : videoUrl ? (
          <video
            controls
            preload="metadata"
            className="aspect-video w-full"
            src={videoUrl}
            onTimeUpdate={(e) => handleTimeUpdate(e.nativeEvent)}
            onLoadedMetadata={(e) => handleLoadedMetadata(e.nativeEvent)}
            onEnded={handleEnded}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-muted/20 text-muted-foreground">
            Video is currently processing...
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <span className="text-xs text-muted-foreground">
            {isPreview
              ? "Preview mode"
              : isSaving
                ? "Saving..."
                : `${Math.round(watchedPercent)}% watched`}
          </span>
        </div>
        <Progress value={watchedPercent} />
      </div>
    </div>
  );
}
