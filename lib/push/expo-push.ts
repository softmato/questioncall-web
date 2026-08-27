import "server-only";

import PushSubscriptionModel from "@/models/PushSubscription";
import { logError } from "@/lib/error-logging";

export type ExpoMessage = {
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Android notification channel ID */
  channelId?: string;
  priority?: "high" | "normal" | "default";
  sound?: "default" | null;
  /** Notification category ID — maps to client-registered action sets (e.g. Accept/Decline for calls) */
  categoryId?: string;
  /**
   * Absolute URL of an image to attach to the notification (Expo `richContent`).
   *
   * On Android this renders as a BigPictureStyle expandable notification, which
   * is what makes a photo-only question readable from the tray without opening
   * the app. Ignored when `dataOnly` is set — a data message renders nothing.
   */
  image?: string | null;
  /**
   * When true, the push is delivered as a data-only FCM message (no top-level
   * `title`/`body`), so the FCM SDK renders nothing and the message is handed
   * to the app's own `FirebaseMessagingService`.
   *
   * Incoming calls set this, and require it: only a data-only message reaches
   * `onMessageReceived` when the app has been killed, which is what lets
   * `CallNotificationService` raise the full-screen ringing UI instead of a
   * plain notification.
   *
   * An earlier attempt set this for calls while no native receiver existed, so
   * a killed app rang not at all — strictly worse than a plain notification.
   * The rule that follows: only ever set this for a message type something
   * native is guaranteed to pick up.
   */
  dataOnly?: boolean;
};

type ExpoTicketOk = { status: "ok"; id: string };
type ExpoTicketError = {
  status: "error";
  message: string;
  details?: { error?: string };
};
type ExpoTicket = ExpoTicketOk | ExpoTicketError;

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100;

async function sendChunk(
  entries: Array<{ token: string; subId: string }>,
  message: ExpoMessage,
): Promise<void> {
  const payload = entries.map((e) => ({
    to: e.token,
    // For data-only pushes we MUST omit title/body so Android delivers it as a
    // data message (which wakes the JS background task). Otherwise FCM shows
    // the notification itself and our headless task never runs.
    ...(message.dataOnly ? {} : { title: message.title, body: message.body }),
    data: message.data ?? {},
    channelId: message.channelId ?? "default",
    priority: message.priority ?? "normal",
    // Data-only messages should be silent at the FCM layer; the client decides
    // whether to play a ringtone (CallKeep does for incoming calls).
    sound: message.dataOnly ? null : message.sound !== undefined ? message.sound : "default",
    ...(message.categoryId ? { categoryId: message.categoryId } : {}),
    // Only meaningful on a rendered notification; a data-only message has no
    // tray UI for the image to attach to.
    ...(message.image && !message.dataOnly
      ? { richContent: { image: message.image } }
      : {}),
  }));

  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const resBody = await res.text().catch(() => "(unreadable)");
    console.warn(
      `[expo-push] HTTP ${res.status} from Expo push service: ${resBody}`,
    );
    return;
  }

  const json = (await res.json()) as { data: ExpoTicket[] };
  const tickets: ExpoTicket[] = json.data ?? [];

  let okCount = 0;
  let errorCount = 0;
  const errorCodes: Record<string, number> = {};

  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i];
    if (ticket.status === "error") {
      errorCount++;
      const errorCode = ticket.details?.error ?? "unknown";
      errorCodes[errorCode] = (errorCodes[errorCode] ?? 0) + 1;

      const tokenTail = entries[i].token.slice(-12);
      console.warn(
        `[expo-push] Ticket error ...${tokenTail}: ${ticket.message} (${errorCode})`,
      );

      // DeviceNotRegistered = token is stale — prune it so we don't keep trying
      if (errorCode === "DeviceNotRegistered") {
        await PushSubscriptionModel.findByIdAndDelete(entries[i].subId).catch(
          () => null,
        );
      }
    } else {
      okCount++;
    }
  }

  // Log batch summary
  const total = tickets.length;
  if (errorCount > 0) {
    const codeSummary = Object.entries(errorCodes)
      .map(([code, count]) => `${code}=${count}`)
      .join(", ");
    console.warn(
      `[expo-push] Batch result: ${okCount}/${total} ok, ${errorCount} errors (${codeSummary})`,
    );

    // Persist the most severe errors for monitoring
    // Uses a stable message so logError deduplicates by errorKey and increments count correctly
    for (const [code, codeCount] of Object.entries(errorCodes)) {
      if (codeCount > 0) {
        logError(`Expo push ticket error: ${code}`, {
          context: {
            errorCode: code,
            batchCount: codeCount,
            batchSize: total,
            notificationType: message.data?.type,
            channelId: message.channelId,
          },
        }).catch(() => {});
      }
    }
  } else {
    console.log(
      `[expo-push] Batch result: ${okCount}/${total} ok, 0 errors`,
    );
  }
}

/**
 * Send a push notification via Expo's push service to one or more Android subscriptions.
 *
 * Expo's push API accepts both Expo push tokens (ExpoPushToken[...]) and raw FCM/device
 * tokens, so we forward every Android subscription through the service. If a token is
 * stale, Expo returns DeviceNotRegistered and we prune it from the database.
 */
export async function sendExpoPush(
  subscriptions: Array<{ _id: { toString(): string }; endpoint: string }>,
  message: ExpoMessage,
): Promise<void> {
  const entries = subscriptions.map((s) => ({
    token: s.endpoint,
    subId: s._id.toString(),
  }));

  if (entries.length === 0) return;

  const totalChunks = Math.ceil(entries.length / CHUNK_SIZE);
  console.log(
    `[expo-push] Sending ${entries.length} notification(s) ` +
      `(type=${message.data?.type ?? "unknown"}, ` +
      `channelId=${message.channelId ?? "default"}, ` +
      `chunks=${totalChunks})`,
  );

  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    await sendChunk(entries.slice(i, i + CHUNK_SIZE), message).catch((err) => {
      const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;
      console.error(
        `[expo-push] Chunk ${chunkIndex}/${totalChunks} send failed:`,
        err,
      );
      logError("Expo push chunk send failed", {
        context: {
          chunkIndex,
          totalChunks,
          entriesInChunk: Math.min(CHUNK_SIZE, entries.length - i),
          notificationType: message.data?.type,
          error: err instanceof Error ? err.message : String(err),
        },
      }).catch(() => {});
    });
  }

  console.log(
    `[expo-push] Done sending ${entries.length} notification(s) (${totalChunks} chunk(s))`,
  );
}
