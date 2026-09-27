"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PhoneOffIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { type CallRingtone, DEFAULT_CALL_SETTINGS } from "@/lib/call-settings";
import { playCallTone } from "@/lib/call-tone-player";
import { startPersistentCall } from "@/lib/persistent-call-events";
import { cn } from "@/lib/utils";

// ── Constants ────────────────────────────────────────────────────
const RINGING_TIMEOUT_MS = 30_000; // Match the callee's timeout

export type OutgoingCallState = {
  callSessionId: string;
  channelId: string;
  mode: "AUDIO" | "VIDEO";
};

type OutgoingCallOverlayProps = {
  /** The outgoing call being placed, or null if none */
  call: OutgoingCallState | null;
  /** Called when the caller cancels, or the call is accepted/rejected/timed out */
  onDismiss: () => void;
  /** Set externally when a CALL_ACCEPTED_EVENT arrives via Pusher */
  wasAccepted: boolean;
  /** Set externally when a CALL_REJECTED_EVENT arrives via Pusher */
  wasRejected: boolean;
  /** Set externally when the call timed out and was marked missed */
  wasMissed: boolean;
  /** Optional custom outgoing ringback tone preset */
  ringbackTone?: CallRingtone;
};

export function OutgoingCallOverlay({
  call,
  onDismiss,
  wasAccepted,
  wasRejected,
  wasMissed,
  ringbackTone = DEFAULT_CALL_SETTINGS.outgoingRingtone,
}: OutgoingCallOverlayProps) {
  const router = useRouter();
  const [cancellingCallId, setCancellingCallId] = useState<string | null>(null);
  const stopToneRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!call?.callSessionId) return;
    void router.prefetch(`/calls/${call.callSessionId}`);
  }, [call?.callSessionId, router]);

  // Token pre-fetch removed: the /api/calls/create response now ships the
  // caller's LiveKit token directly, and channel-chat caches it via
  // cacheCallToken before this overlay even mounts. The call page consumes
  // the cache on mount, so a separate /token round-trip would be wasted work.

  // ── OPT-5: Pre-warm media during ringing ───────────────────────
  useEffect(() => {
    if (!call) return;

    const constraints: MediaStreamConstraints = {
      audio: true,
      video: call.mode === "VIDEO",
    };

    let stream: MediaStream | null = null;
    let released = false;

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((s) => {
        // Resolved after the overlay closed — see incoming-call-overlay.
        if (released) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        mediaStreamRef.current = s;
      })
      .catch(() => {
        // Non-fatal
      });

    return () => {
      released = true;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      mediaStreamRef.current = null;
    };
  }, [call]);

  // ── Ringback tone playback ────────────────────────────────────
  useEffect(() => {
    if (!call) return;

    stopToneRef.current?.();
    stopToneRef.current = playCallTone(ringbackTone, {
      loop: true,
      volume: 0.85,
    });

    return () => {
      stopToneRef.current?.();
      stopToneRef.current = null;
    };
  }, [call, ringbackTone]);

  const stopAudio = useCallback(() => {
    stopToneRef.current?.();
    stopToneRef.current = null;
  }, []);

  const releasePreWarmedMedia = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  // ── Handle accepted ───────────────────────────────────────────
  useEffect(() => {
    if (!call || !wasAccepted) return;
    stopAudio();
    releasePreWarmedMedia();
    // Token is already cached from the pre-fetch above (OPT-3).
    // The call page will pick it up from the cache instantly.
    startPersistentCall({ callSessionId: call.callSessionId });
    router.push(`/calls/${call.callSessionId}`);
    onDismiss();
  }, [call, wasAccepted, stopAudio, releasePreWarmedMedia, router, onDismiss]);

  // ── Handle rejected ───────────────────────────────────────────
  useEffect(() => {
    if (!call || !wasRejected) return;
    stopAudio();
    releasePreWarmedMedia();
    toast.info("Call was declined");
    onDismiss();
  }, [call, wasRejected, stopAudio, releasePreWarmedMedia, onDismiss]);

  // ── Handle missed timeout from server ────────────────────────
  useEffect(() => {
    if (!call || !wasMissed) return;
    stopAudio();
    releasePreWarmedMedia();
    toast.info("No answer");
    onDismiss();
  }, [call, wasMissed, stopAudio, releasePreWarmedMedia, onDismiss]);

  // ── Timeout: no answer ────────────────────────────────────────
  useEffect(() => {
    if (!call) return;

    timeoutRef.current = setTimeout(async () => {
      stopAudio();
      releasePreWarmedMedia();

      // Cancel the call on the server
      try {
        await fetch(`/api/calls/${call.callSessionId}/missed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            timedOutBy: "caller",
          }),
        });
      } catch {
        // Non-fatal
      }

      toast.info("No answer");
      onDismiss();
    }, RINGING_TIMEOUT_MS);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [call, stopAudio, releasePreWarmedMedia, onDismiss]);

  // ── Cancel handler (caller clicks cancel) ─────────────────────
  const handleCancel = useCallback(async () => {
    const isCancellingCurrentCall =
      call && cancellingCallId === call.callSessionId;

    if (!call || isCancellingCurrentCall) return;
    setCancellingCallId(call.callSessionId);
    stopAudio();
    releasePreWarmedMedia();

    try {
      await fetch(`/api/calls/${call.callSessionId}/cancel`, {
        method: "POST",
      });
    } catch {
      // Non-fatal
    }

    onDismiss();
  }, [call, cancellingCallId, stopAudio, releasePreWarmedMedia, onDismiss]);

  if (!call) {
    return null;
  }

  const isCancelling = cancellingCallId === call.callSessionId;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-label="Calling"
    >
      <div
        className={cn(
          "relative mx-4 flex w-full max-w-sm flex-col items-center gap-6 rounded-3xl p-8",
          "bg-gradient-to-br from-slate-900/95 via-slate-800/95 to-slate-900/95",
          "border border-white/10 shadow-2xl shadow-black/50",
          "animate-in fade-in slide-in-from-bottom-4 duration-300",
        )}
      >
        {/* Loading spinner */}
        <div className="relative flex items-center justify-center">
          <span className="absolute size-20 animate-ping rounded-full bg-blue-500/20" />
          <Loader2Icon className="size-12 animate-spin text-blue-400" />
        </div>

        <div className="flex flex-col items-center gap-1.5 text-center">
          <h2 className="text-xl font-semibold text-white">Calling…</h2>
          <p className="text-sm text-blue-400/90">
            Waiting for the other person to pick up
          </p>
        </div>

        {/* Cancel button */}
        <button
          onClick={handleCancel}
          disabled={isCancelling}
          className="group flex flex-col items-center gap-2 transition-transform active:scale-90"
          aria-label="Cancel call"
        >
          <div
            className={cn(
              "flex size-16 items-center justify-center rounded-full",
              "bg-red-500 shadow-lg shadow-red-500/30",
              "transition-colors hover:bg-red-600",
              isCancelling && "opacity-50",
            )}
          >
            <PhoneOffIcon className="size-7 text-white" />
          </div>
          <span className="text-xs font-medium text-red-400/90">
            {isCancelling ? "Cancelling…" : "Cancel"}
          </span>
        </button>
      </div>
    </div>
  );
}
