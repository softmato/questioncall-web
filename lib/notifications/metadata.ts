type NotificationLike = {
  type?: string | null;
  href?: string | null;
};

/**
 * Android channel for incoming calls.
 *
 * Versioned on purpose: Android freezes a channel's sound/importance/vibration
 * at creation time, so the app can only ship changed call-ring settings under a
 * new id. Must match CALL_CHANNEL_ID in app/lib/push-notifications.ts — if the
 * two drift, the push arrives referencing a channel the app never created and
 * Android strips its sound and priority.
 */
export const CALL_CHANNEL_ID = "calls_v2";

export type NotificationTheme = {
  /** Title shown in the push notification */
  title: string;
  /** Android notification channel ID (must match channels registered in the app) */
  channelId: "chat" | "questions" | typeof CALL_CHANNEL_ID | "wallet" | "default";
  /** FCM / Expo delivery priority */
  priority: "high" | "normal" | "default";
  /** Play sound */
  sound: "default" | null;
};

/**
 * Maps a notification type (and optional href) to a distinct push-notification
 * theme: title, Android channel, priority, and sound.
 *
 * The href is used to disambiguate coarse types like PAYMENT and SYSTEM that
 * cover several real-world events (withdrawal vs subscription, message vs call).
 */
export function getNotificationTheme(
  type?: string | null,
  href?: string | null,
): NotificationTheme {
  switch (type) {
    // ── Chat ─────────────────────────────────────────────────────────────────
    case "CHAT_MESSAGE":
      return { title: "New Message", channelId: "chat", priority: "high", sound: "default" };

    // ── Questions ────────────────────────────────────────────────────────────
    case "QUESTION_ACCEPTED":
      return { title: "Question Accepted", channelId: "questions", priority: "high", sound: "default" };

    case "QUESTION_RESET":
      return { title: "Question Reopened", channelId: "questions", priority: "normal", sound: "default" };

    case "ANSWER_SUBMITTED":
      return { title: "Answer Ready", channelId: "questions", priority: "high", sound: "default" };

    case "DEADLINE_WARNING":
      return { title: "Answer Deadline Warning", channelId: "questions", priority: "high", sound: "default" };

    // ── Channel lifecycle ────────────────────────────────────────────────────
    case "CHANNEL_CLOSED":
      return { title: "Channel Closed", channelId: "chat", priority: "normal", sound: null };

    case "CHANNEL_EXPIRED":
      return { title: "Channel Expired", channelId: "chat", priority: "normal", sound: null };

    // ── Social interactions ──────────────────────────────────────────────────
    case "REACTION_RECEIVED":
      return { title: "New Reaction", channelId: "questions", priority: "normal", sound: "default" };

    case "COMMENT_RECEIVED":
      return { title: "New Comment", channelId: "questions", priority: "high", sound: "default" };

    // Fan-out to every teacher when a student posts. High priority on purpose:
    // questions are claimed first-come-first-served, so a push Doze defers by
    // an hour is worth nothing to the teacher who receives it.
    case "NEW_QUESTION_POSTED":
      return { title: "New Question Posted", channelId: "questions", priority: "high", sound: "default" };

    case "NEW_QUESTION_INTEREST":
      return { title: "Question For You", channelId: "questions", priority: "normal", sound: "default" };

    case "PROFILE_VIEWED":
      return { title: "Profile View", channelId: "default", priority: "normal", sound: null };

    case "NEW_FOLLOWER":
      return { title: "New Follower", channelId: "default", priority: "normal", sound: "default" };

    // ── Ratings ──────────────────────────────────────────────────────────────
    // High priority: this fires when the asker closes the channel, and it is
    // the teacher's only signal that the job settled and points moved. At
    // "normal" Doze could hold it until the next time the device woke, long
    // after the wallet balance had already changed underneath them.
    case "RATING_RECEIVED":
      return { title: "New Rating Received", channelId: "wallet", priority: "high", sound: "default" };

    // ── Wallet & payments (use href to distinguish sub-events) ───────────────
    case "PAYMENT": {
      if (href?.startsWith("/wallet")) {
        // Withdrawal submitted or approved
        return { title: "Wallet Update", channelId: "wallet", priority: "high", sound: "default" };
      }
      if (href?.startsWith("/subscription")) {
        return { title: "Plan Activated", channelId: "wallet", priority: "high", sound: "default" };
      }
      // Course purchase or generic payment
      return { title: "Payment Approved", channelId: "wallet", priority: "high", sound: "default" };
    }

    case "DAILY_TARGET_BONUS":
      return { title: "Daily Target Reached", channelId: "wallet", priority: "normal", sound: "default" };

    // ── Course studio ────────────────────────────────────────────────────────
    case "COURSE_VIDEO_READY":
      return { title: "Video Ready 🎬", channelId: "default", priority: "high", sound: "default" };

    // ── System / Calls (use href to distinguish) ─────────────────────────────
    case "SYSTEM": {
      if (href?.startsWith("/calls/") || href?.startsWith("/call/")) {
        return {
          title: "Incoming Call",
          channelId: CALL_CHANNEL_ID,
          priority: "high",
          sound: "default",
        };
      }
      return { title: "System Update", channelId: "default", priority: "normal", sound: null };
    }

    default:
      return { title: "QuestionCall", channelId: "default", priority: "normal", sound: null };
  }
}

export function getNotificationTitle(type?: string | null) {
  return getNotificationTheme(type).title;
}

export function getDefaultNotificationHref(type?: string | null) {
  switch (type) {
    case "PAYMENT":
      return "/subscription";
    case "NEW_QUESTION_POSTED":
    case "NEW_QUESTION_INTEREST":
      return "/feed";
    case "RATING_RECEIVED":
      return "/wallet";
    case "DAILY_TARGET_BONUS":
      return "/wallet";
    case "COURSE_VIDEO_READY":
      return "/studio";
    case "SYSTEM":
      return "/settings";
    default:
      return "/";
  }
}

export function resolveNotificationHref(notification: NotificationLike) {
  if (typeof notification.href === "string" && notification.href.trim().length > 0) {
    return notification.href.trim();
  }

  return getDefaultNotificationHref(notification.type);
}
