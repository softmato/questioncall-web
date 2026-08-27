"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
  useLocalParticipant,
  useRemoteParticipants,
} from "@livekit/components-react";
import "@livekit/components-styles";
import {
  AlertTriangleIcon,
  ClockIcon,
  Loader2Icon,
  Maximize2Icon,
  Minimize2Icon,
  PhoneOffIcon,
  ScreenShareIcon,
  ScreenShareOffIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  CHANNEL_EXTENSION_MINUTES,
  CHANNEL_WARNING_THRESHOLD_MS,
  MAX_CHANNEL_TIME_EXTENSIONS,
} from "@/lib/channel-timer";
import { CALL_ROOM_OPTIONS } from "@/lib/call-room-options";
import { consumeCachedCallToken } from "@/lib/call-token-cache";
import { getPusherClient } from "@/lib/pusher/pusherClient";
import {
  CALL_ENDED_EVENT,
  CHANNEL_TIMER_UPDATED_EVENT,
  getChannelPusherName,
} from "@/lib/pusher/events";
import {
  PERSISTENT_CALL_START_EVENT,
  type PersistentCallStartDetail,
} from "@/lib/persistent-call-events";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/store/hooks";

type CallStatus = "RINGING" | "ACTIVE" | "ENDED" | "REJECTED" | "MISSED" | "CANCELLED";

type CallJoinPayload = {
  token: string;
  serverUrl: string;
  channelId: string;
  timerDeadline: string;
  timeExtensionCount: number;
};

type CallSessionPayload = {
  callSessionId: string;
  channelId: string;
  teacherId: string;
  studentId: string;
  callerId: string | null;
  status: CallStatus;
  mode: "AUDIO" | "VIDEO";
  teacherName?: string | null;
  studentName?: string | null;
  teacherImage?: string | null;
  studentImage?: string | null;
};

type ActiveCall = CallJoinPayload & {
  callSessionId: string;
  connectionVersion: number;
  mode: "AUDIO" | "VIDEO";
  session: CallSessionPayload | null;
};

type StartCallOptions = {
  force?: boolean;
  silent?: boolean;
};

type PersistedActiveCall = {
  callSessionId: string;
  channelId?: string;
  savedAt: number;
};

const ACTIVE_CALL_STORAGE_KEY = "qc.activeCall";
const ACTIVE_CALL_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const REJOIN_GRACE_MS = 60_000;
const REJOIN_RETRY_MS = 3_000;
// Grace before treating "remote participant left" as a possible call end —
// covers transient peer network blips without delaying real hangups much.
const REMOTE_LEFT_GRACE_MS = 2_000;

/**
 * Watches remote-participant presence inside the LiveKit room. When the peer
 * leaves (explicit hangup, app killed, or their `call:ended` Pusher event was
 * dropped), verify the session status with the server after a short grace and
 * tear down if the call is over — instead of sitting in the room forever.
 */
function RemotePresenceWatcher({
  callSessionId,
  onRemoteLeft,
}: {
  callSessionId: string;
  onRemoteLeft: () => void;
}) {
  const remoteParticipants = useRemoteParticipants();
  const remoteCount = remoteParticipants.length;
  const hadRemoteRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (remoteCount > 0) {
      hadRemoteRef.current = true;
      return;
    }
    if (!hadRemoteRef.current) return;

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void (async () => {
        try {
          const res = await fetch(`/api/calls/${callSessionId}`);
          const data = await res.json().catch(() => null);
          const status = data?.status as string | undefined;
          if (status && status !== "ACTIVE" && status !== "RINGING") {
            onRemoteLeft();
          }
        } catch {
          // Status check failed — leave teardown to the Pusher event.
        }
      })();
    }, REMOTE_LEFT_GRACE_MS);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [remoteCount, callSessionId, onRemoteLeft]);

  return null;
}

function readPersistedActiveCall(): PersistedActiveCall | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(ACTIVE_CALL_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PersistedActiveCall>;
    if (!parsed.callSessionId || typeof parsed.savedAt !== "number") {
      window.localStorage.removeItem(ACTIVE_CALL_STORAGE_KEY);
      return null;
    }

    if (Date.now() - parsed.savedAt > ACTIVE_CALL_MAX_AGE_MS) {
      window.localStorage.removeItem(ACTIVE_CALL_STORAGE_KEY);
      return null;
    }

    return {
      callSessionId: parsed.callSessionId,
      channelId: parsed.channelId,
      savedAt: parsed.savedAt,
    };
  } catch {
    window.localStorage.removeItem(ACTIVE_CALL_STORAGE_KEY);
    return null;
  }
}

function persistActiveCall(call: Pick<ActiveCall, "callSessionId" | "channelId">) {
  if (typeof window === "undefined") return;

  const payload: PersistedActiveCall = {
    callSessionId: call.callSessionId,
    channelId: call.channelId,
    savedAt: Date.now(),
  };

  window.localStorage.setItem(ACTIVE_CALL_STORAGE_KEY, JSON.stringify(payload));
}

function clearPersistedActiveCall(callSessionId?: string | null) {
  if (typeof window === "undefined") return;

  if (callSessionId) {
    const current = readPersistedActiveCall();
    if (current?.callSessionId && current.callSessionId !== callSessionId) {
      return;
    }
  }

  window.localStorage.removeItem(ACTIVE_CALL_STORAGE_KEY);
}

function getCallIdFromPathname(pathname: string | null) {
  const match = pathname?.match(/^\/calls\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "Time's up";

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) return error;
  }
  return fallback;
}

function ScreenShareButton() {
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();
  const [isToggling, setIsToggling] = useState(false);
  const canShare =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function";

  const handleToggle = async () => {
    if (!canShare || isToggling) return;
    setIsToggling(true);
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled, {
        audio: true,
        video: true,
        contentHint: "detail",
        surfaceSwitching: "include",
        systemAudio: "include",
      });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not start screen sharing in this browser.",
      );
    } finally {
      setIsToggling(false);
    }
  };

  if (!canShare) {
    return null;
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        void handleToggle();
      }}
      disabled={isToggling}
      className={cn(
        "gap-1.5 rounded-full border-white/15 bg-white/10 px-3 text-xs text-white hover:bg-white/20 hover:text-white",
        isScreenShareEnabled &&
          "border-emerald-300/50 bg-emerald-400/15 text-emerald-50",
      )}
    >
      {isToggling ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : isScreenShareEnabled ? (
        <ScreenShareOffIcon className="size-3.5" />
      ) : (
        <ScreenShareIcon className="size-3.5" />
      )}
      {isScreenShareEnabled ? "Stop sharing" : "Share screen"}
    </Button>
  );
}

function CallTopBar({
  activeCall,
  countdown,
  isEnding,
  isExtendingTime,
  isFullscreen,
  onEnd,
  onExtend,
  onMaximize,
  onMinimize,
}: {
  activeCall: ActiveCall;
  countdown: number;
  isEnding: boolean;
  isExtendingTime: boolean;
  isFullscreen: boolean;
  onEnd: () => void;
  onExtend: () => void;
  onMaximize: () => void;
  onMinimize: () => void;
}) {
  const timeExtensionsRemaining = Math.max(
    0,
    MAX_CHANNEL_TIME_EXTENSIONS - activeCall.timeExtensionCount,
  );
  const canExtendTime =
    countdown > 0 &&
    countdown <= CHANNEL_WARNING_THRESHOLD_MS &&
    timeExtensionsRemaining > 0;

  return (
    <div
      className={cn(
        "absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 border-b border-white/10 bg-black/80 px-3 py-2.5 text-white backdrop-blur-sm",
        !isFullscreen && "rounded-t-2xl border-b-white/15 px-2 py-2",
      )}
    >
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-white/50">
          Live Call
        </p>
        <p className="truncate text-sm font-semibold text-white">
          {activeCall.mode === "VIDEO" ? "Video room" : "Audio room"}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {isFullscreen ? <ScreenShareButton /> : null}

        <div
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
            countdown > 0 && countdown <= CHANNEL_WARNING_THRESHOLD_MS
              ? "border-amber-400/50 bg-amber-400/10 text-amber-200"
              : "border-white/10 bg-white/5 text-white/70",
          )}
        >
          <ClockIcon className="size-3.5" />
          {formatCountdown(countdown)}
        </div>

        {isFullscreen && canExtendTime ? (
          <Button
            size="sm"
            variant="outline"
            className="rounded-full border-amber-300/40 bg-amber-300/10 px-2.5 text-xs text-amber-100 hover:bg-amber-300/20 hover:text-amber-50"
            onClick={onExtend}
            disabled={isExtendingTime}
          >
            {isExtendingTime ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <>+{CHANNEL_EXTENSION_MINUTES}m</>
            )}
          </Button>
        ) : null}

        <Button
          size="icon"
          variant="outline"
          onClick={isFullscreen ? onMinimize : onMaximize}
          className="size-8 rounded-full border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          aria-label={isFullscreen ? "Minimize call" : "Open call"}
        >
          {isFullscreen ? (
            <Minimize2Icon className="size-3.5" />
          ) : (
            <Maximize2Icon className="size-3.5" />
          )}
        </Button>

        <Button
          size="sm"
          variant="destructive"
          onClick={onEnd}
          disabled={isEnding}
          className={cn("gap-1.5 rounded-full shadow-lg", !isFullscreen && "px-2")}
        >
          {isEnding ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <PhoneOffIcon className="size-3.5" />
          )}
          {isFullscreen ? (isEnding ? "Leaving..." : "End") : null}
        </Button>
      </div>
    </div>
  );
}

export function PersistentCallHost() {
  const pathname = usePathname();
  const router = useRouter();
  const userId = useAppSelector((state) => state.user.id);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const startingCallIdRef = useRef<string | null>(null);
  const endingRef = useRef(false);
  const restoreAttemptedRef = useRef(false);
  const rejoiningCallIdRef = useRef<string | null>(null);
  const rejoinTimerRef = useRef<number | null>(null);

  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [loadingCallId, setLoadingCallId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [isExtendingTime, setIsExtendingTime] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    if (activeCall) {
      persistActiveCall(activeCall);
    }
  }, [activeCall]);

  useEffect(() => {
    return () => {
      if (rejoinTimerRef.current) {
        window.clearTimeout(rejoinTimerRef.current);
      }
    };
  }, []);

  const routeCallId = getCallIdFromPathname(pathname);
  const isFullscreen =
    Boolean(activeCall?.callSessionId) && routeCallId === activeCall?.callSessionId;

  const clearCall = useCallback(
    (navigateToChannel = false) => {
      const current = activeCallRef.current;
      const channelId = current?.channelId;
      if (rejoinTimerRef.current) {
        window.clearTimeout(rejoinTimerRef.current);
        rejoinTimerRef.current = null;
      }
      rejoiningCallIdRef.current = null;
      clearPersistedActiveCall(current?.callSessionId);
      activeCallRef.current = null;
      endingRef.current = false;
      setActiveCall(null);
      setLoadingCallId(null);
      setIsEnding(false);
      setIsReconnecting(false);
      setError(null);

      if (navigateToChannel && channelId) {
        router.replace(`/channel/${channelId}`);
      }
    },
    [router],
  );

  const mergeSession = useCallback(
    (callSessionId: string, session: CallSessionPayload | null) => {
      if (!session) return;
      setActiveCall((current) => {
        if (!current || current.callSessionId !== callSessionId) return current;
        return {
          ...current,
          mode: session.mode,
          channelId: session.channelId || current.channelId,
          session,
        };
      });
    },
    [],
  );

  const fetchSession = useCallback(
    async (callSessionId: string) => {
      const response = await fetch(`/api/calls/${callSessionId}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(getErrorMessage(data, "Failed to load call details."));
      }
      mergeSession(callSessionId, data as CallSessionPayload);
      return data as CallSessionPayload;
    },
    [mergeSession],
  );

  const startCall = useCallback(
    async (callSessionId: string, options: StartCallOptions = {}) => {
      if (!callSessionId) return;
      if (activeCallRef.current?.callSessionId === callSessionId && !options.force) {
        return true;
      }
      if (startingCallIdRef.current === callSessionId && !options.force) return false;

      startingCallIdRef.current = callSessionId;
      if (!options.silent) {
        setLoadingCallId(callSessionId);
      }
      setError(null);

      try {
        let session: CallSessionPayload | null = null;
        const sessionPromise = fetchSession(callSessionId)
          .then((value) => {
            session = value;
            return value;
          })
          .catch(() => null);

        let joinDetails = consumeCachedCallToken(callSessionId);
        if (!joinDetails) {
          const response = await fetch(`/api/calls/${callSessionId}/token`);
          const data = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(getErrorMessage(data, "Failed to join call."));
          }
          joinDetails = data as CallJoinPayload;
        }

        const resolvedSession = session ?? (await sessionPromise);
        const current = activeCallRef.current;
        if (!joinDetails.token || !joinDetails.serverUrl) {
          throw new Error("The call token is missing. Please try joining again.");
        }

        const nextCall: ActiveCall = {
          callSessionId,
          token: joinDetails.token,
          serverUrl: joinDetails.serverUrl,
          channelId: joinDetails.channelId,
          timerDeadline: joinDetails.timerDeadline,
          timeExtensionCount: joinDetails.timeExtensionCount ?? 0,
          connectionVersion:
            current?.callSessionId === callSessionId
              ? current.connectionVersion + 1
              : 0,
          mode: resolvedSession?.mode ?? "VIDEO",
          session: resolvedSession,
        };

        endingRef.current = false;
        activeCallRef.current = nextCall;
        persistActiveCall(nextCall);
        setIsReconnecting(false);
        setActiveCall(nextCall);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error joining call";
        setError(message);
        if (!options.silent) {
          clearPersistedActiveCall(callSessionId);
          toast.error(message);
        }
        return false;
      } finally {
        if (startingCallIdRef.current === callSessionId) {
          startingCallIdRef.current = null;
        }
        if (!options.silent) {
          setLoadingCallId(null);
        }
      }
    },
    [fetchSession],
  );

  useEffect(() => {
    if (!routeCallId) return;
    void startCall(routeCallId);
  }, [routeCallId, startCall]);

  useEffect(() => {
    if (restoreAttemptedRef.current || routeCallId) return;
    restoreAttemptedRef.current = true;

    const persisted = readPersistedActiveCall();
    if (!persisted?.callSessionId) return;

    void startCall(persisted.callSessionId, { silent: true });
  }, [routeCallId, startCall]);

  useEffect(() => {
    const handleStart = (event: Event) => {
      const detail = (event as CustomEvent<PersistentCallStartDetail>).detail;
      if (detail?.callSessionId) {
        void startCall(detail.callSessionId);
      }
    };

    window.addEventListener(PERSISTENT_CALL_START_EVENT, handleStart);
    return () => {
      window.removeEventListener(PERSISTENT_CALL_START_EVENT, handleStart);
    };
  }, [startCall]);

  useEffect(() => {
    if (!activeCall?.timerDeadline) return;

    const updateCountdown = () => {
      const remainingMs = new Date(activeCall.timerDeadline).getTime() - Date.now();
      setCountdown(Math.max(0, remainingMs));
    };

    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [activeCall?.timerDeadline]);

  useEffect(() => {
    if (!activeCall?.channelId) return;

    const client = getPusherClient();
    if (!client) return;

    const pusherChannelName = getChannelPusherName(activeCall.channelId);
    const channel = client.subscribe(pusherChannelName);

    const handleTimerUpdated = (payload: {
      timerDeadline?: string;
      timeExtensionCount?: number;
      extendedBy?: string;
      extendedByName?: string;
      extensionMinutes?: number;
    }) => {
      if (!payload.timerDeadline || typeof payload.timeExtensionCount !== "number") {
        return;
      }

      setActiveCall((current) => {
        if (!current || current.channelId !== activeCall.channelId) return current;
        return {
          ...current,
          timerDeadline: payload.timerDeadline!,
          timeExtensionCount: payload.timeExtensionCount!,
        };
      });

      if (
        payload.extendedBy &&
        userId &&
        payload.extendedBy !== userId &&
        !endingRef.current
      ) {
        toast.info(
          `${payload.extendedByName || "A participant"} added ${
            payload.extensionMinutes || CHANNEL_EXTENSION_MINUTES
          } more minutes.`,
        );
      }
    };

    const handleCallEnded = (payload: {
      callSessionId?: string;
      endedBy?: string;
    }) => {
      if (payload.callSessionId !== activeCall.callSessionId) return;

      if (!endingRef.current && (!userId || payload.endedBy !== userId)) {
        toast.info("The call has ended.");
      }

      endingRef.current = true;
      clearCall(routeCallId === activeCall.callSessionId);
    };

    channel.bind(CHANNEL_TIMER_UPDATED_EVENT, handleTimerUpdated);
    channel.bind(CALL_ENDED_EVENT, handleCallEnded);

    return () => {
      channel.unbind(CHANNEL_TIMER_UPDATED_EVENT, handleTimerUpdated);
      channel.unbind(CALL_ENDED_EVENT, handleCallEnded);
      client.unsubscribe(pusherChannelName);
    };
  }, [
    activeCall?.callSessionId,
    activeCall?.channelId,
    clearCall,
    routeCallId,
    userId,
  ]);

  const handleExtendTime = useCallback(async () => {
    const current = activeCallRef.current;
    if (!current?.channelId || isExtendingTime) return;

    setIsExtendingTime(true);
    try {
      const response = await fetch(`/api/channels/${current.channelId}/extend`, {
        method: "POST",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getErrorMessage(data, "Failed to add more time."));
      }

      setActiveCall((call) => {
        if (!call || call.callSessionId !== current.callSessionId) return call;
        return {
          ...call,
          timerDeadline: data.timerDeadline,
          timeExtensionCount: data.timeExtensionCount,
        };
      });
      toast.success(`Added ${CHANNEL_EXTENSION_MINUTES} more minutes to the call.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add more time.");
    } finally {
      setIsExtendingTime(false);
    }
  }, [isExtendingTime]);

  const handleEndCall = useCallback(() => {
    const current = activeCallRef.current;
    if (!current || endingRef.current) return;

    endingRef.current = true;
    setIsEnding(true);

    void fetch(`/api/calls/${current.callSessionId}/end`, {
      method: "POST",
      keepalive: true,
    }).catch((fetchError) => {
      console.error("Error setting call as ended", fetchError);
    });

    clearCall(routeCallId === current.callSessionId);
  }, [clearCall, routeCallId]);

  const attemptRejoin = useCallback(
    (callSessionId: string, deadline: number) => {
      if (endingRef.current) return;
      if (rejoiningCallIdRef.current === callSessionId) return;

      rejoiningCallIdRef.current = callSessionId;
      setIsReconnecting(true);
      toast.info("Reconnecting to the call...");

      const run = async () => {
        if (endingRef.current) return;

        const rejoined = await startCall(callSessionId, {
          force: true,
          silent: true,
        });

        if (rejoined) {
          rejoiningCallIdRef.current = null;
          if (rejoinTimerRef.current) {
            window.clearTimeout(rejoinTimerRef.current);
            rejoinTimerRef.current = null;
          }
          toast.success("Call reconnected.");
          return;
        }

        if (Date.now() >= deadline) {
          rejoiningCallIdRef.current = null;
          setIsReconnecting(false);
          toast.error("Could not reconnect to the call.");
          clearCall(routeCallId === callSessionId);
          return;
        }

        rejoinTimerRef.current = window.setTimeout(run, REJOIN_RETRY_MS);
      };

      void run();
    },
    [clearCall, routeCallId, startCall],
  );

  const handleDisconnected = useCallback(() => {
    if (endingRef.current) return;
    const callSessionId = activeCallRef.current?.callSessionId;
    if (!callSessionId) return;

    attemptRejoin(callSessionId, Date.now() + REJOIN_GRACE_MS);
  }, [attemptRejoin]);

  // The peer left the LiveKit room and the server confirmed the session is
  // over (covers dropped `call:ended` Pusher events and killed apps).
  const handleRemoteLeft = useCallback(() => {
    if (endingRef.current) return;
    const current = activeCallRef.current;
    if (!current) return;

    toast.info("The call has ended.");
    endingRef.current = true;
    clearCall(routeCallId === current.callSessionId);
  }, [clearCall, routeCallId]);

  const handleMinimize = useCallback(() => {
    const channelId = activeCallRef.current?.channelId;
    router.push(channelId ? `/channel/${channelId}` : "/");
  }, [router]);

  const handleMaximize = useCallback(() => {
    const callSessionId = activeCallRef.current?.callSessionId;
    if (callSessionId) {
      router.push(`/calls/${callSessionId}`);
    }
  }, [router]);

  const loadingCallRoute = routeCallId && loadingCallId === routeCallId;
  const showRouteError = routeCallId && error && !activeCall;

  const liveKitClassName = useMemo(
    () =>
      cn(
        "h-full w-full",
        "[&_.lk-video-conference]:h-full [&_.lk-video-conference]:w-full",
        "[&_.lk-grid-layout]:h-full [&_.lk-grid-layout]:w-full",
        "[&_[data-lk-source=screen\\_share]_video]:!object-contain",
        "[&_video[data-lk-source=screen\\_share]]:!object-contain",
        "[&_.lk-focus-layout]:!bg-black",
        "[&_.lk-participant-tile[data-lk-source=screen\\_share]]:!bg-black",
        isFullscreen
          ? [
              "[&_.lk-control-bar]:fixed [&_.lk-control-bar]:bottom-6 [&_.lk-control-bar]:left-1/2 [&_.lk-control-bar]:-translate-x-1/2",
              "[&_.lk-control-bar]:z-40",
              "[&_.lk-control-bar]:flex [&_.lk-control-bar]:items-center [&_.lk-control-bar]:gap-1",
              "[&_.lk-control-bar]:rounded-[2rem] [&_.lk-control-bar]:border [&_.lk-control-bar]:border-white/15",
              "[&_.lk-control-bar]:bg-black/75 [&_.lk-control-bar]:px-3 [&_.lk-control-bar]:py-2",
              "[&_.lk-control-bar]:backdrop-blur-xl [&_.lk-control-bar]:shadow-xl",
              "[&_.lk-control-bar_.lk-button]:min-h-[44px] [&_.lk-control-bar_.lk-button]:min-w-[44px]",
              "[&_.lk-media-device-menu]:z-50 [&_.lk-button-group-menu]:z-50",
              "[&_.lk-button-group-menu]:bottom-full [&_.lk-button-group-menu]:top-auto",
              "[&_.lk-disconnect-button]:!hidden",
              "[&_.lk-grid-layout]:pb-24 [&_.lk-grid-layout]:pt-14",
            ]
          : [
              "[&_.lk-control-bar]:!hidden",
              "[&_.lk-grid-layout]:pt-12",
              "[&_.lk-participant-name]:hidden",
            ],
      ),
    [isFullscreen],
  );

  if (loadingCallRoute) {
    return (
      <div className="fixed inset-0 z-[9999] flex h-[100dvh] w-[100dvw] flex-col items-center justify-center gap-4 bg-black text-white">
        <Loader2Icon className="size-10 animate-spin text-white/70" />
        <p className="text-sm text-white/70">Connecting to the live room...</p>
      </div>
    );
  }

  if (showRouteError) {
    return (
      <div className="fixed inset-0 z-[9999] flex h-[100dvh] w-[100dvw] flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <AlertTriangleIcon className="size-10 text-red-500" />
        <h2 className="text-xl font-bold">Call Error</h2>
        <p className="max-w-md text-muted-foreground">{error}</p>
        <Button
          onClick={() => router.back()}
          variant="outline"
          className="mt-4 rounded-full"
        >
          Go Back
        </Button>
      </div>
    );
  }

  if (!activeCall) return null;

  return (
    <div
      className={cn(
        "z-[9999] isolate overflow-hidden bg-black text-white shadow-2xl",
        isFullscreen
          ? "fixed inset-0 flex h-[100dvh] w-[100dvw] flex-col"
          : "fixed bottom-4 right-4 h-56 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-white/15 md:bottom-6 md:right-6",
      )}
    >
      <LiveKitRoom
        video={true}
        audio={true}
        token={activeCall.token}
        serverUrl={activeCall.serverUrl}
        data-lk-theme="default"
        onDisconnected={handleDisconnected}
        options={CALL_ROOM_OPTIONS}
        className={liveKitClassName}
      >
        <CallTopBar
          activeCall={activeCall}
          countdown={countdown}
          isEnding={isEnding}
          isExtendingTime={isExtendingTime}
          isFullscreen={isFullscreen}
          onEnd={handleEndCall}
          onExtend={() => {
            void handleExtendTime();
          }}
          onMaximize={handleMaximize}
          onMinimize={handleMinimize}
        />
        {isReconnecting ? (
          <div className="absolute inset-x-0 top-12 z-30 mx-auto flex w-fit items-center gap-2 rounded-full border border-amber-300/40 bg-amber-400/15 px-3 py-1.5 text-xs font-medium text-amber-100 backdrop-blur">
            <Loader2Icon className="size-3.5 animate-spin" />
            Reconnecting
          </div>
        ) : null}
        <VideoConference />
        <RoomAudioRenderer />
        <RemotePresenceWatcher
          callSessionId={activeCall.callSessionId}
          onRemoteLeft={handleRemoteLeft}
        />
      </LiveKitRoom>
    </div>
  );
}
