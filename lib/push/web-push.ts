import "server-only";

import webpush from "web-push";

import { sendExpoPush } from "@/lib/push/expo-push";
import { getNotificationTheme, resolveNotificationHref } from "@/lib/notifications/metadata";
import {
  isNotificationEnabledForUser,
  type UserNotificationPrefs,
} from "@/lib/notification-prefs";
import { connectToDatabase } from "@/lib/mongodb";
import PushSubscriptionModel from "@/models/PushSubscription";
import User from "@/models/User";
import { logError } from "@/lib/error-logging";

type NotificationPayload = {
  type: string;
  message: string;
  href?: string | null;
  /** Override the default theme-based title (e.g. use sender's name) */
  title?: string;
  /** URL to a user avatar / icon shown as the notification large icon */
  icon?: string | null;
  /**
   * Absolute URL of an image attached to the notification body — Android
   * BigPictureStyle via Expo `richContent`, `image` on the Web Notification.
   *
   * Used by the new-question fan-out so a teacher can see the photo of the
   * problem straight from the tray. Never set for calls (data-only pushes
   * render nothing).
   */
  image?: string | null;
  /** Extra string key/value pairs merged into the Expo push data object */
  extraData?: Record<string, string>;
  /**
   * Force a system-rendered (notification-payload) push for a message that
   * would otherwise go out data-only — i.e. an incoming call.
   *
   * Only the ring-fallback tier in /api/calls/create sets this, and it exists
   * because data-only delivery has a hard dependency the ring UI does not
   * advertise: the OS has to start our process so CallNotificationService can
   * run. Aggressive OEMs (Infinix/XOS is this project's documented problem
   * device, plus Xiaomi/Oppo/Vivo/Tecno/Realme) refuse that start once the app
   * has been swiped from recents, and the callee then gets *nothing* — not
   * even the in-service fallback notification, which lives inside
   * onMessageReceived and so never runs either.
   *
   * A notification-payload push is drawn by the FCM SDK itself and needs no
   * process start, so it lands on those devices — it is the same path their
   * chat notifications already arrive on. This does NOT replace the data-only
   * push (see the long comment below); it is a second tier behind it.
   */
  forceSystemRendered?: boolean;
};

type WebPushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  icon: string;
  badge: string;
  image?: string;
};

let vapidConfigured = false;

function getVapidConfig() {
  const publicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ||
    process.env.VAPID_PUBLIC_KEY?.trim() ||
    "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || "";
  const subject = process.env.VAPID_SUBJECT?.trim() || "";
  return { publicKey, privateKey, subject };
}

function ensureWebPushConfigured() {
  if (vapidConfigured) return true;
  const { publicKey, privateKey, subject } = getVapidConfig();
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export function isWebPushConfigured() {
  const { publicKey, privateKey, subject } = getVapidConfig();
  return Boolean(publicKey && privateKey && subject);
}

export function getWebPushPublicKey() {
  return getVapidConfig().publicKey;
}

function buildWebPushPayload(notification: NotificationPayload): WebPushPayload {
  const theme = getNotificationTheme(notification.type, notification.href);
  const url = resolveNotificationHref(notification);
  return {
    title: notification.title || theme.title,
    body: notification.message,
    url,
    tag: `notification-${notification.type.toLowerCase()}`,
    icon: notification.icon || "/icon.png",
    badge: "/icon.png",
    ...(notification.image ? { image: notification.image } : {}),
  };
}

function isGoneSubscriptionError(error: unknown) {
  const statusCode =
    typeof error === "object" && error && "statusCode" in error
      ? Number((error as { statusCode?: number }).statusCode)
      : undefined;
  return statusCode === 410;
}

/**
 * Send a push notification to all of a user's registered devices.
 *
 * - Android (Expo Push Token) → delivered via Expo's push service (no Firebase key needed).
 * - Web / iOS → delivered via Web Push API (VAPID).
 */
export async function sendPushNotificationToUser(
  userId: string,
  notification: NotificationPayload,
) {
  const startTime = Date.now();
  const notifyType = notification.type ?? "unknown";

  console.log(
    `[web-push] Sending notification type=${notifyType} to user=${userId} message="${notification.message.slice(0, 60)}"`,
  );

  await connectToDatabase();

  // Per-user category gating. Run this BEFORE the subscription query so a
  // muted category short-circuits without touching push tables. The in-app
  // notification record is still saved upstream — this only stops the FCM /
  // web-push delivery.
  //
  // Incoming calls (extraData.callSessionId) are exempt — they're governed by
  // callSettings.silentIncomingCalls in the call flow, not here.
  const userPrefs = await User.findById(userId)
    .select("notificationPrefs")
    .lean<{ notificationPrefs?: Partial<UserNotificationPrefs> | null } | null>();
  const allowed = isNotificationEnabledForUser(
    userPrefs?.notificationPrefs,
    notification.type,
    notification.href,
    notification.extraData as Record<string, unknown> | null | undefined,
  );
  if (!allowed) {
    console.log(
      `[web-push] User=${userId} muted type=${notifyType} via notificationPrefs — skipping push (in-app notification still recorded)`,
    );
    return;
  }

  const subscriptions = await PushSubscriptionModel.find({ userId })
    .select("_id endpoint expirationTime keys platform")
    .lean();

  if (subscriptions.length === 0) {
    console.warn(`[web-push] No push subscriptions found for user=${userId} type=${notifyType}`);
    return;
  }

  const theme = getNotificationTheme(notification.type, notification.href);
  const url = resolveNotificationHref(notification);

  // Compute counts by platform
  const androidSubs = subscriptions.filter((s) => (s.platform ?? "web") === "android");
  const androidCount = androidSubs.length;
  const webSubs = subscriptions.filter((s) => {
    const platform = s.platform ?? "web";
    return platform === "web" || platform === "ios";
  });
  const webCount = webSubs.filter((s) => (s.platform ?? "web") === "web").length;
  const iosCount = webSubs.filter((s) => s.platform === "ios").length;

  console.log(
    `[web-push] User=${userId} type=${notifyType} has ${subscriptions.length} subscription(s) (android=${androidCount}${webCount > 0 ? ` web=${webCount}` : ""}${iosCount > 0 ? ` ios=${iosCount}` : ""})`,
  );

  let webErrorCount = 0;

  // ── Android → Expo push ──────────────────────────────────────────────────
  if (androidSubs.length > 0) {
    const isIncomingCall = Boolean(notification.extraData?.callSessionId);
    // Ring-fallback tier: same call, same channel, same high priority — the
    // ONLY thing that changes is who renders it. See `forceSystemRendered`.
    const systemRendered = notification.forceSystemRendered === true;
    const resolvedTitle = notification.title || theme.title;

    console.log(
      `[web-push] Sending Android push (${androidSubs.length} sub(s)) for user=${userId} type=${notifyType}${
        isIncomingCall ? (systemRendered ? " [call-fallback]" : " [call]") : ""
      }`,
    );
    // Calls MUST be data-only, and the app depends on it.
    //
    // A push carrying title/body is rendered by the FCM SDK itself, and when
    // the app is killed `onMessageReceived` is never called — which is why a
    // killed app used to show a flat, silent line of text with no way to
    // answer. Data-only messages always reach the app's own
    // CallNotificationService (see app/plugins/withCallKeep.js), which raises
    // the real full-screen ringing UI: screen on, over the lock screen, with
    // Accept/Decline.
    //
    // The title/body are still sent inside `data` so that service — and the JS
    // handler, when the app is alive — can render the caller's name.
    //
    // Do not "fix" this back to a notification payload: it would silently
    // return killed-app calls to a plain unanswerable notification.
    await sendExpoPush(androidSubs, {
      title: resolvedTitle,
      body: notification.message,
      data: {
        type: notification.type,
        url,
        href: url,
        ...notification.extraData,
        // Mirrored inside `data` so the client handler can render the
        // full-screen call UI straight from the payload.
        ...(isIncomingCall
          ? { title: resolvedTitle, body: notification.message }
          : {}),
      },
      channelId: theme.channelId,
      // Calls are ALWAYS high priority, independent of the theme lookup.
      // getNotificationTheme() only classifies a call by (type === "SYSTEM" &&
      // href starts with /call), so any future change to the call href would
      // silently drop these to normal priority — which Doze defers, meaning a
      // killed device would simply never ring, with nothing logged anywhere.
      // Key off the payload we already trust instead.
      priority: isIncomingCall ? "high" : theme.priority,
      sound: theme.sound,
      categoryId: isIncomingCall ? "incoming_call" : undefined,
      // A call is data-only *unless* it is the fallback tier, whose entire
      // purpose is to be rendered by the system without waking our process.
      dataOnly: isIncomingCall && !systemRendered,
      image: notification.image ?? null,
    }).catch((err) => {
      console.error("[web-push] Expo push failed for user:", userId, "type:", notifyType, err);
      logError("Expo push failed in web-push dispatcher", {
        userId,
        context: {
          notificationType: notifyType,
          androidSubCount: androidSubs.length,
          error: err instanceof Error ? err.message : String(err),
        },
      }).catch(() => {});
    });
  }

  // ── Web / iOS → Web Push API (VAPID) ────────────────────────────────────

  if (webSubs.length === 0) {
    const elapsed = Date.now() - startTime;
    console.log(
      `[web-push] Done user=${userId} type=${notifyType} — Android=${androidCount} web=${webCount} ios=${iosCount} errors=${webErrorCount} (${elapsed}ms)`,
    );
    return;
  }

  const webPushConfigured = ensureWebPushConfigured();
  if (!webPushConfigured) {
    console.warn(`[web-push] VAPID is not configured; skipping web/iOS push for user=${userId} type=${notifyType}`);
    const elapsed = Date.now() - startTime;
    console.log(
      `[web-push] Done user=${userId} type=${notifyType} — Android=${androidCount} web=${webCount} ios=${iosCount} (VAPID not configured, web/iOS skipped) (${elapsed}ms)`,
    );
    return;
  }

  const payload = buildWebPushPayload(notification);
  const endpointTail = (ep: string) => (ep.length > 30 ? `…${ep.slice(-30)}` : ep);

  const results = await Promise.allSettled(
    webSubs.map(async (subscription) => {
      if (!subscription.keys?.p256dh || !subscription.keys?.auth) {
        console.warn(`[web-push] Subscription id=${String(subscription._id)} missing keys; skipping`);
        return { status: "skipped" as const, reason: "missing_keys" };
      }

      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expirationTime ?? undefined,
            keys: {
              p256dh: subscription.keys.p256dh,
              auth: subscription.keys.auth,
            },
          },
          JSON.stringify(payload),
          { TTL: 300 },
        );
        return { status: "ok" as const };
      } catch (error) {
        const statusCode =
          typeof error === "object" && error && "statusCode" in error
            ? Number((error as { statusCode?: number }).statusCode)
            : undefined;

        console.warn(
          `[web-push] Send failed for user=${userId} type=${notifyType} endpoint=${endpointTail(subscription.endpoint)} status=${statusCode ?? "unknown"}`,
        );

        if (isGoneSubscriptionError(error)) {
          await PushSubscriptionModel.findByIdAndDelete(subscription._id).catch(() => null);
          return { status: "deleted" as const, reason: "gone_410" };
        }

        if (statusCode !== 404) {
          console.error("[web-push] Unexpected push send error", error);
          logError("Web push send error", {
            userId,
            context: {
              notificationType: notifyType,
              statusCode,
              endpointTail: endpointTail(subscription.endpoint),
              platform: subscription.platform ?? "web",
              error: error instanceof Error ? error.message : String(error),
            },
          }).catch(() => {});
        }

        return { status: "error" as const, reason: `status_${statusCode ?? "unknown"}` };
      }
    }),
  );

  webErrorCount = results.filter(
    (r) => r.status === "fulfilled" && r.value?.status === "error",
  ).length;

  const elapsed = Date.now() - startTime;
  console.log(
    `[web-push] Done user=${userId} type=${notifyType} — ` +
      `Android=${androidCount} web=${webCount} ios=${iosCount} webErrors=${webErrorCount} ` +
      `(${elapsed}ms)`,
  );
}
