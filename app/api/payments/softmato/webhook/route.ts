import { verifyWebhook } from "@softmato/sdk";

import { settleSoftmatoInvoice } from "@/lib/payment/softmato";

/** Softmato → us. Verify the RAW body first; a non-2xx makes Softmato retry. */
export async function POST(req: Request) {
  const secret = process.env.SOFTMATO_WEBHOOK_SECRET;
  if (!secret) return new Response("webhook not configured", { status: 503 });

  const result = verifyWebhook({
    secret,
    body: await req.text(),
    signature: req.headers.get("x-softmato-signature"),
    timestamp: req.headers.get("x-softmato-timestamp"),
  });
  if (!result.valid) return new Response("invalid", { status: 400 });

  // Cancelled/failed/expired leave the invoice open for a retry — nothing to do.
  if (result.payload.event === "payment.success") {
    try {
      await settleSoftmatoInvoice(result.payload.invoice_id);
    } catch (error) {
      console.error("[softmato webhook]", result.payload.invoice_id, error);
      return new Response("retry", { status: 500 });
    }
  }

  return new Response("ok");
}
