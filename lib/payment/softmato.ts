import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "crypto";

import { completeChapterPurchase } from "@/lib/chapter-purchases";
import { completeCoursePurchase } from "@/lib/course-purchases";
import { connectToDatabase } from "@/lib/mongodb";
import { notifyUser } from "@/lib/notifications/notify-user";
import { activateSubscription } from "@/lib/subscription-activation";
import { finalizePercentageCouponRedemption } from "@/lib/subscription-coupons";
import Transaction from "@/models/Transaction";

/*
 * Softmato's payment API, called directly. @softmato/sdk lives on a restricted
 * GitHub Packages registry that Vercel's install cannot read (aba7815), so the
 * three calls and the webhook check used here follow its wire format instead:
 * Bearer client secret, an Idempotency-Key on every POST, and an HMAC-SHA256 of
 * `${timestamp}.${rawBody}` on webhooks.
 */
const SOFTMATO_API = "https://softmato.com/api/v1";

// ponytail: no retry on transport errors (the SDK retried with the same key); the buyer taps Pay again.
async function softmatoRequest<T>(method: "GET" | "POST", path: string, body?: object): Promise<T> {
  // Read per call so a deploy without SOFTMATO_SECRET still builds; the call site answers 503.
  const secret = process.env.SOFTMATO_SECRET?.trim();
  if (!secret) throw new Error("SOFTMATO_SECRET is not set.");

  const res = await fetch(`${SOFTMATO_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
      ...(body && { "Content-Type": "application/json", "Idempotency-Key": randomUUID() }),
    },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  // Set while a rotated-out secret still works: deploy the new one before it lapses.
  const expires = res.headers.get("softmato-secret-expires");
  if (expires) console.error(`[softmato] client secret superseded; it stops working at ${expires}`);

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Softmato ${method} ${path} failed (${res.status}): ${data?.error?.message ?? "no error body"}`);
  }
  return data as T;
}

export function getSoftmato() {
  return {
    /** Idempotent on external_ref: a repeat returns the existing invoice. */
    createInvoice: (input: object) =>
      softmatoRequest<{ invoice_id: string }>("POST", "/invoices", input),
    /** No amount: Softmato reads it from the invoice. */
    createCheckout: (input: { invoice_id: string; return_url: string }) =>
      softmatoRequest<{ checkout_url: string }>("POST", "/checkout", input),
    // An invoice number contains a slash; it travels as path segments, not %2F.
    getInvoice: (invoiceId: string) =>
      softmatoRequest<{ status: string }>(
        "GET",
        `/invoices/${invoiceId.split("/").map(encodeURIComponent).join("/")}`,
      ),
  };
}

/**
 * Verify a webhook against its RAW body before trusting any field of it. The
 * timestamp is inside the signature, and anything over 5 minutes off either way
 * is refused, so a captured delivery cannot be replayed. Null when not genuine.
 */
export function verifySoftmatoWebhook(
  secret: string,
  body: string,
  signature: string | null,
  timestamp: string | null,
): { event: string; invoice_id: string } | null {
  const ts = Number(timestamp?.trim() || NaN);
  if (!signature || !Number.isInteger(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return null;

  const expected = Buffer.from(createHmac("sha256", secret).update(`${ts}.${body}`, "utf8").digest("hex"));
  const claimed = Buffer.from(signature);
  if (expected.length !== claimed.length || !timingSafeEqual(expected, claimed)) return null;

  return JSON.parse(body);
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
