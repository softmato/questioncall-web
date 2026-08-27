import "server-only";

import { emitNotification } from "@/lib/pusher/pusherServer";
import { sendPushNotificationToUser } from "@/lib/push/web-push";
import Notification from "@/models/Notification";

type NotifyUserInput = {
  userId: string;
  /** Notification category (drives theme/title + per-user mute prefs). */
  type?: string;
  message: string;
  href: string;
  /** Override the theme's default push title. */
  title?: string;
  /** Small icon (e.g. sender avatar) shown on the push. */
  icon?: string | null;
  /** Large preview image attached to the push (e.g. a question's photo). */
  image?: string | null;
  /** Extra string key/values merged into the push data payload. */
  extraData?: Record<string, string>;
};

/**
 * Record an in-app notification AND fan it out to the user's devices (Expo +
 * Web Push), mirroring the established approve-transaction flow. Use this for
 * anything completed outside the app (e.g. web checkout submissions) so the
 * user gets a push, not just an in-app toast on the web page.
 *
 * Never throws — notification/push failures are logged and swallowed so they
 * can't break the originating request.
 */
export async function notifyUser({
  userId,
  type = "PAYMENT",
  message,
  href,
  title,
  icon,
  image,
  extraData,
}: NotifyUserInput) {
  const notification = await Notification.create({
    userId,
    type,
    message,
    href,
    isRead: false,
  }).catch((err) => {
    console.error("[notifyUser] failed to create notification", err);
    return null;
  });

  if (notification) {
    await emitNotification(String(userId), notification).catch(() => {});
  }

  await sendPushNotificationToUser(String(userId), {
    type,
    message,
    href,
    title,
    icon,
    image,
    extraData,
  }).catch((err) => console.error("[notifyUser] push failed", err));
}
