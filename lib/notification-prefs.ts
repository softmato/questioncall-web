/**
 * Per-user notification preferences.
 *
 * Four categories cover every NOTIFICATION_TYPES enum value cleanly. Pushes
 * are gated at the dispatcher (sendPushNotificationToUser) — when a user
 * disables a category, the dispatcher skips sending FCM/web-push for those
 * types but the notification is still persisted to the DB so the in-app
 * notification center shows it.
 *
 * Calls are intentionally NOT in this list — they're governed by
 * callSettings.silentIncomingCalls (see lib/call-settings.ts).
 */

export const NOTIFICATION_PREF_KEYS = [
  "questions",
  "chat",
  "wallet",
  "announcements",
] as const;

export type NotificationPrefKey = (typeof NOTIFICATION_PREF_KEYS)[number];

export type UserNotificationPrefs = Record<NotificationPrefKey, boolean>;

export const DEFAULT_NOTIFICATION_PREFS: UserNotificationPrefs = {
  questions: true,
  chat: true,
  wallet: true,
  announcements: true,
};

export function normalizeNotificationPrefs(
  prefs?: Partial<UserNotificationPrefs> | null,
): UserNotificationPrefs {
  return {
    questions:
      typeof prefs?.questions === "boolean"
        ? prefs.questions
        : DEFAULT_NOTIFICATION_PREFS.questions,
    chat:
      typeof prefs?.chat === "boolean" ? prefs.chat : DEFAULT_NOTIFICATION_PREFS.chat,
    wallet:
      typeof prefs?.wallet === "boolean"
        ? prefs.wallet
        : DEFAULT_NOTIFICATION_PREFS.wallet,
    announcements:
      typeof prefs?.announcements === "boolean"
        ? prefs.announcements
        : DEFAULT_NOTIFICATION_PREFS.announcements,
  };
}

/**
 * Maps a notification's (type, href, extraData) to the user-pref category
 * that gates it.
 *
 * - `null` → not gated; always send (incoming calls fall here)
 * - returned key → gated by `prefs[key]`
 */
export function getNotificationPrefKey(
  type: string,
  href?: string | null,
  extraData?: Record<string, unknown> | null,
): NotificationPrefKey | null {
  // Incoming calls are SYSTEM type with a callSessionId. Never filtered —
  // the user can mute them via callSettings.silentIncomingCalls.
  if (extraData?.callSessionId) return null;

  switch (type) {
    case "QUESTION_ACCEPTED":
    case "QUESTION_RESET":
    case "ANSWER_SUBMITTED":
    case "DEADLINE_WARNING":
    case "REACTION_RECEIVED":
    case "COMMENT_RECEIVED":
    case "NEW_QUESTION_INTEREST":
    case "NEW_QUESTION_POSTED":
      return "questions";

    case "CHANNEL_CLOSED":
    case "CHANNEL_EXPIRED":
      return "chat";

    case "PAYMENT":
    case "RATING_RECEIVED":
    case "DAILY_TARGET_BONUS":
      return "wallet";

    case "PROFILE_VIEWED":
    case "NEW_FOLLOWER":
      return "announcements";

    case "SYSTEM":
      // Non-call SYSTEM is announcements/platform notices.
      return "announcements";

    default:
      // Unknown type — fail open (send anyway) so we don't accidentally
      // suppress a notification type someone forgets to map.
      return null;
  }
}

/**
 * True if the user has this notification type enabled (or it's not gated).
 */
export function isNotificationEnabledForUser(
  prefs: Partial<UserNotificationPrefs> | null | undefined,
  type: string,
  href?: string | null,
  extraData?: Record<string, unknown> | null,
): boolean {
  const key = getNotificationPrefKey(type, href, extraData);
  if (key === null) return true;
  // Missing prefs = use defaults (all true).
  const normalized = normalizeNotificationPrefs(prefs);
  return normalized[key];
}
