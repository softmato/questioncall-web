"use client";

// Module-level dedup set — shared across all mounted instances of NotificationBell.
// This prevents double-toasts when the component is mounted in both the sidebar
// footer (mobile) and the authenticated header (desktop) simultaneously.
const _toastedNotificationIds = new Set<string>();

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BellIcon,
  BellOffIcon,
  BellRingIcon,
  CheckCheckIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supportsPushNotifications, urlBase64ToUint8Array } from "@/lib/push/client";
import { getPusherClient } from "@/lib/pusher/pusherClient";
import { getUserPusherName, NOTIFICATION_EVENT } from "@/lib/pusher/events";

type NotificationType =
  | "RATING_RECEIVED"
  | "QUESTION_ACCEPTED"
  | "QUESTION_RESET"
  | "CHANNEL_CLOSED"
  | "CHANNEL_EXPIRED"
  | "PAYMENT"
  | "ANSWER_SUBMITTED"
  | "DEADLINE_WARNING"
  | "NEW_QUESTION_POSTED"
  | "NEW_QUESTION_INTEREST"
  | "REACTION_RECEIVED"
  | "COMMENT_RECEIVED"
  | "CHAT_MESSAGE"
  | "PROFILE_VIEWED"
  | "NEW_FOLLOWER"
  | "DAILY_TARGET_BONUS"
  | "COURSE_VIDEO_READY"
  | "SYSTEM";

type Notification = {
  id: string;
  type: NotificationType;
  message: string;
  href?: string;
  isRead: boolean;
  createdAt: string;
};

const NOTIFICATION_ICONS: Record<NotificationType, string> = {
  RATING_RECEIVED: "⭐",
  QUESTION_ACCEPTED: "✅",
  QUESTION_RESET: "🔄",
  CHANNEL_CLOSED: "🔒",
  CHANNEL_EXPIRED: "⌛",
  PAYMENT: "💳",
  ANSWER_SUBMITTED: "📝",
  DEADLINE_WARNING: "⏰",
  NEW_QUESTION_POSTED: "❓",
  NEW_QUESTION_INTEREST: "💡",
  REACTION_RECEIVED: "❤️",
  COMMENT_RECEIVED: "💬",
  CHAT_MESSAGE: "💬",
  PROFILE_VIEWED: "👀",
  NEW_FOLLOWER: "➕",
  DAILY_TARGET_BONUS: "🎯",
  COURSE_VIDEO_READY: "🎬",
  SYSTEM: "🔔",
};

function formatTimeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

async function getPushRegistration() {
  const existingRegistration = await navigator.serviceWorker.getRegistration();
  if (existingRegistration) {
    return existingRegistration;
  }

  try {
    const readyRegistration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), 3000);
      }),
    ]);

    return readyRegistration;
  } catch {
    return null;
  }
}

function hasMatchingApplicationServerKey(
  subscription: PushSubscription,
  publicKey: string,
) {
  const currentKey = subscription.options.applicationServerKey;

  if (!currentKey) {
    return true;
  }

  const currentBytes = new Uint8Array(currentKey);
  const expectedBytes = urlBase64ToUint8Array(publicKey);

  if (currentBytes.length !== expectedBytes.length) {
    return false;
  }

  return currentBytes.every((value, index) => value === expectedBytes[index]);
}

type NotificationBellProps = {
  userId: string;
};

export function NotificationBell({ userId }: NotificationBellProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [isPushLoading, setIsPushLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const isMarkingAllReadRef = useRef(false);
  const subscriptionSyncRef = useRef<string | null>(null);
  const hasFetchedServerStateRef = useRef(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const syncSubscriptionWithServer = useCallback(
    async (subscription: PushSubscription, force = false) => {
      const syncKey = subscription.endpoint;

      if (!force && subscriptionSyncRef.current === syncKey) {
        return true;
      }

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
        }),
      });

      if (!response.ok) {
        subscriptionSyncRef.current = null;
        return false;
      }

      subscriptionSyncRef.current = syncKey;
      return true;
    },
    [],
  );

  const fetchPushPublicKey = useCallback(async () => {
    const keyResponse = await fetch("/api/push/public-key", {
      cache: "no-store",
    });
    const keyData = await keyResponse.json().catch(() => ({}));

    if (!keyResponse.ok || !keyData.publicKey) {
      throw new Error(keyData.error || "Push notifications are not configured yet.");
    }

    return keyData.publicKey as string;
  }, []);

  const createPushSubscription = useCallback(async () => {
    const registration = await getPushRegistration();
    if (!registration) {
      throw new Error("Push service is still starting. Please try again.");
    }

    const publicKey = await fetchPushPublicKey();

    return registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }, [fetchPushPublicKey]);

  // Use server-side push state as source of truth (fixes Android toggle regression).
  // Only runs once on mount — not on every focus/visibility event.
  const fetchServerPushState = useCallback(async () => {
    const supported = supportsPushNotifications();
    setPushSupported(supported);

    if (!supported) {
      setPushEnabled(false);
      return;
    }

    setPushPermission(Notification.permission);

    try {
      const res = await fetch("/api/push/status", { cache: "no-store" });
      if (!res.ok) {
        return;
      }

      const data = await res.json();
      setPushEnabled(Boolean(data.hasActiveSubscription));

      // If server says we have a subscription but browser doesn't have one,
      // silently try to re-create it (background, no UI flap).
      if (data.hasActiveSubscription && Notification.permission === "granted") {
        const registration = await getPushRegistration();
        if (registration) {
          const browserSub = await registration.pushManager.getSubscription();
          if (browserSub) {
            subscriptionSyncRef.current = browserSub.endpoint;
          }
        }
      }
    } catch {
      // Network error — keep current state, don't flap
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch server-side push state once on mount — no focus/visibility re-checks.
  useEffect(() => {
    if (hasFetchedServerStateRef.current) {
      return;
    }
    hasFetchedServerStateRef.current = true;
    void fetchServerPushState();
  }, [fetchServerPushState]);

  // Subscribe to real-time notifications via Pusher
  useEffect(() => {
    if (!userId) return;
    const client = getPusherClient();
    if (!client) return;

    const userChannel = client.subscribe(getUserPusherName(userId));

    userChannel.bind(NOTIFICATION_EVENT, (payload: { notification: Notification }) => {
      if (payload.notification) {
        setNotifications((prev) => {
          // Prevent duplicates — skip if this notification ID already exists
          if (prev.some((n) => n.id === payload.notification.id)) {
            return prev;
          }
          return [payload.notification, ...prev];
        });
        // Only toast once per notification ID across all mounted instances.
        if (!_toastedNotificationIds.has(payload.notification.id)) {
          _toastedNotificationIds.add(payload.notification.id);
          // Evict old IDs to avoid unbounded growth (keep last 50)
          if (_toastedNotificationIds.size > 50) {
            const first = _toastedNotificationIds.values().next().value;
            if (first) _toastedNotificationIds.delete(first);
          }
          toast(payload.notification.message, {
            icon: NOTIFICATION_ICONS[payload.notification.type] ?? "🔔",
          });
        }
      }
    });

    return () => {
      userChannel.unbind(NOTIFICATION_EVENT);
      // NOTE: Do NOT call client.unsubscribe() here.
      // workspace-shell owns the user channel lifecycle and binds call events
      // (CALL_INCOMING, CALL_ACCEPTED, etc.) to it. Pusher's unsubscribe()
      // is not reference-counted — it destroys the entire channel, killing
      // all call signaling for the user.
    };
  }, [userId]);

  // Fetch on open
  useEffect(() => {
    if (isOpen) void fetchNotifications();
  }, [isOpen, fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const markRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    await fetch(`/api/notifications/${id}`, { method: "PATCH" });
  };

  const handleNotificationClick = async (notification: Notification) => {
    setIsOpen(false);
    await markRead(notification.id);

    if (notification.href) {
      router.push(notification.href);
    }
  };

  const markAllRead = useCallback(async () => {
    if (isMarkingAllReadRef.current || !notifications.some((n) => !n.isRead)) {
      return;
    }

    isMarkingAllReadRef.current = true;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));

    try {
      const response = await fetch("/api/notifications/all", { method: "POST" });
      if (!response.ok) {
        await fetchNotifications();
      }
    } finally {
      isMarkingAllReadRef.current = false;
    }
  }, [fetchNotifications, notifications]);

  useEffect(() => {
    if (!isOpen || isLoading || unreadCount === 0) {
      return;
    }

    void markAllRead();
  }, [isLoading, isOpen, markAllRead, unreadCount]);

  const enablePushNotifications = async () => {
    if (!supportsPushNotifications()) {
      toast.error("This browser does not support push notifications here.");
      return;
    }

    if (Notification.permission === "denied") {
      setPushPermission("denied");
      toast.error("Notifications are blocked in your browser settings.");
      return;
    }

    setIsPushLoading(true);

    try {
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();

      setPushPermission(permission);

      if (permission !== "granted") {
        toast.error("Notification permission was not granted.");
        return;
      }

      const registration = await getPushRegistration();
      if (!registration) {
        throw new Error("Push service is still starting. Please try again.");
      }

      let subscription = await registration.pushManager.getSubscription();
      let publicKey: string | null = null;

      if (subscription) {
        publicKey = await fetchPushPublicKey();
      }

      if (subscription && publicKey && !hasMatchingApplicationServerKey(subscription, publicKey)) {
        await subscription.unsubscribe().catch(() => {});
        subscriptionSyncRef.current = null;
        subscription = null;
      }

      if (!subscription) {
        subscription = await createPushSubscription();
      }

      const synced = await syncSubscriptionWithServer(subscription, true);
      if (!synced) {
        throw new Error("Failed to enable push notifications.");
      }

      setPushEnabled(true);
      toast.success("Real device notifications are enabled.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to enable push notifications.",
      );
    } finally {
      setIsPushLoading(false);
    }
  };

  const disablePushNotifications = async () => {
    if (!supportsPushNotifications()) {
      return;
    }

    setIsPushLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
          }),
        });

        await subscription.unsubscribe();
      }

      subscriptionSyncRef.current = null;
      setPushEnabled(false);
      toast.success("Device notifications are turned off.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to disable push notifications.",
      );
    } finally {
      setIsPushLoading(false);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="relative flex size-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Notifications"
      >
        <BellIcon className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-background">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-x-3 top-[4.5rem] z-50 max-h-[calc(100svh-5.5rem)] overflow-hidden rounded-2xl border border-border bg-background shadow-xl animate-in fade-in slide-in-from-top-2 duration-150 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[420px] sm:w-[26rem] sm:max-w-[calc(100vw-1rem)]">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            <div className="flex w-full items-center justify-end gap-1 sm:w-auto">
              {pushSupported ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1 px-2 text-xs text-muted-foreground"
                  disabled={isPushLoading}
                  onClick={() => {
                    void (pushEnabled
                      ? disablePushNotifications()
                      : enablePushNotifications());
                  }}
                >
                  {isPushLoading ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : pushEnabled ? (
                    <BellOffIcon className="size-3.5" />
                  ) : (
                    <BellRingIcon className="size-3.5" />
                  )}
                  {pushEnabled
                    ? "Disable alerts"
                    : pushPermission === "denied"
                      ? "Alerts blocked"
                      : "Enable alerts"}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1 px-2 text-xs text-muted-foreground"
                disabled={unreadCount === 0}
                onClick={() => { void markAllRead(); }}
              >
                <CheckCheckIcon className="size-3.5" />
                Mark all read
              </Button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[calc(100svh-11rem)] overflow-y-auto divide-y divide-border/60 sm:max-h-[420px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                Loading…
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                <BellIcon className="size-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => { void handleNotificationClick(n); }}
                  className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50 ${
                    !n.isRead ? "bg-primary/5" : "bg-transparent"
                  }`}
                >
                  <span className="shrink-0 text-lg leading-none mt-0.5">
                    {NOTIFICATION_ICONS[n.type] ?? "🔔"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug break-words ${!n.isRead ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                      {n.message}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground/60">
                      {formatTimeAgo(n.createdAt)}
                    </p>
                  </div>
                  {!n.isRead && (
                    <span className="mt-1.5 shrink-0 size-2 rounded-full bg-primary" />
                  )}
                </button>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="border-t border-border/60 px-4 py-2.5 text-center">
              <span className="text-xs text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
