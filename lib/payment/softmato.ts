import "server-only";

import { SoftmatoClient } from "@softmato/sdk";

import { completeChapterPurchase } from "@/lib/chapter-purchases";
import { completeCoursePurchase } from "@/lib/course-purchases";
import { connectToDatabase } from "@/lib/mongodb";
import { notifyUser } from "@/lib/notifications/notify-user";
import { activateSubscription } from "@/lib/subscription-activation";
import { finalizePercentageCouponRedemption } from "@/lib/subscription-coupons";
import Transaction from "@/models/Transaction";

let client: SoftmatoClient | null = null;

/** Lazy so a deploy without SOFTMATO_SECRET still builds; the call site answers 503. */
export function getSoftmato(): SoftmatoClient {
  const secret = process.env.SOFTMATO_SECRET;
  if (!secret) throw new Error("SOFTMATO_SECRET is not set.");
  client ??= new SoftmatoClient({
    secret,
    onWarning: (warning) => console.error("[softmato]", warning.message),
  });
  return client;
}

/** NPR → paisa. The API only takes integers. */
export const toPaisa = (npr: number) => Math.round(npr * 100);

export type SettleResult = "paid" | "unpaid" | "unknown";

/**
 * Provision whatever a Softmato invoice paid for. Shared by the webhook and the
 * return page: the server-side invoice read is the authority for both, and every
 * branch is idempotent, so the two racing each other provisions once.
 */
export async function settleSoftmatoInvoice(invoiceId: string): Promise<SettleResult> {
  await connectToDatabase();

  const txn = await Transaction.findOne({ gateway: "SOFTMATO", reference: invoiceId });
  if (!txn) return "unknown";
  if (txn.status === "COMPLETED") return "paid";

  const invoice = await getSoftmato().getInvoice(invoiceId);
  if (invoice.status !== "paid") return "unpaid";

  const txnId = txn._id.toString();
  const userId = txn.userId.toString();
  const meta = (txn.meta ?? {}) as Record<string, unknown>;
  const href = typeof meta.returnHref === "string" ? meta.returnHref : "/";
  let message: string;

  if (txn.type === "COURSE_PURCHASE") {
    const done = await completeCoursePurchase({ transactionDocumentId: txnId, gateway: "SOFTMATO" });
    if (done.alreadyCompleted) return "paid";
    message = `Your payment for ${done.courseName} was successful. Course access is unlocked.`;
  } else if (txn.type === "CHAPTER_PURCHASE") {
    const done = await completeChapterPurchase({ transactionDocumentId: txnId, gateway: "SOFTMATO" });
    if (done.alreadyCompleted) return "paid";
    message = `Your payment for ${done.chapterName} was successful. Chapter access is unlocked.`;
  } else {
    // Subscription. activateSubscription extends the end date, so claim the row
    // first — only the caller that flips PENDING→COMPLETED activates.
    const claimed = await Transaction.findOneAndUpdate(
      { _id: txn._id, status: "PENDING" },
      { $set: { status: "COMPLETED" } },
    );
    if (!claimed) return "paid";

    const planSlug = String(meta.planSlug ?? "");
    const activation = await activateSubscription({
      userId,
      planSlug,
      durationDays: typeof meta.durationDays === "number" ? meta.durationDays : null,
    });
    if (!activation.ok) {
      // Un-claim so the webhook retry gets another go.
      await Transaction.updateOne({ _id: txn._id }, { $set: { status: "PENDING" } });
      throw new Error(`Subscription activation failed: ${activation.error}`);
    }

    if (typeof meta.subscriptionCouponId === "string" && meta.subscriptionCouponId) {
      await finalizePercentageCouponRedemption({
        couponId: meta.subscriptionCouponId,
        userId,
        userEmail: null,
        planSlug,
        transactionId: txn._id,
      });
    }
    message = `Your payment for ${activation.planName} was successful. Access is active until ${activation.subscriptionEnd.toLocaleDateString()}.`;
  }

  // Softmato emails the receipt PDF itself; we only push the in-app notice.
  await notifyUser({ userId, message, href });
  return "paid";
}
