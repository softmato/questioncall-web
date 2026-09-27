import Link from "next/link";
import { Types } from "mongoose";

import { MobileReturnRedirect } from "@/components/payment/mobile-return-redirect";
import { connectToDatabase } from "@/lib/mongodb";
import { settleSoftmatoInvoice, type SettleResult } from "@/lib/payment/softmato";
import Transaction from "@/models/Transaction";

export const dynamic = "force-dynamic";

const COPY: Record<SettleResult, { title: string; body: string }> = {
  paid: { title: "Payment successful", body: "Your access is unlocked. A receipt is on its way to your email." },
  unpaid: { title: "Payment not completed", body: "No money was taken. You can try again whenever you're ready." },
  unknown: { title: "Confirming your payment", body: "This can take a minute. Refresh this page, or check back shortly — you'll get a notification once it's confirmed." },
};

/**
 * Where Softmato sends the buyer back. The query string is never trusted: we
 * ask Softmato for the invoice ourselves (settleSoftmatoInvoice), so landing
 * here without paying unlocks nothing.
 */
export default async function SoftmatoReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  let state: SettleResult = "unknown";
  let href = "/";

  if (ref && Types.ObjectId.isValid(ref)) {
    await connectToDatabase();
    const txn = await Transaction.findOne({ _id: ref, gateway: "SOFTMATO" })
      .select("reference meta")
      .lean<{ reference?: string; meta?: { returnHref?: string } }>();
    if (txn?.reference) {
      href = txn.meta?.returnHref ?? "/";
      state = await settleSoftmatoInvoice(txn.reference).catch((error) => {
        console.error("[softmato return]", error);
        return "unknown" as const;
      });
    }
  }

  const { title, body } = COPY[state];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F9FAFB] px-4 text-center dark:bg-[#1C1C1C]">
      {state === "paid" ? <MobileReturnRedirect status="success" method="softmato" /> : null}
      {state === "unpaid" ? <MobileReturnRedirect status="cancelled" method="softmato" /> : null}
      <h1 className="text-2xl font-bold text-neutral-800 dark:text-neutral-100">{title}</h1>
      <p className="max-w-sm text-neutral-600 dark:text-neutral-400">{body}</p>
      <Link
        href={href}
        className="mt-4 rounded-full bg-neutral-900 px-6 py-2.5 font-medium text-white hover:opacity-90 dark:bg-white dark:text-neutral-900"
      >
        {state === "paid" ? "Continue" : "Go back"}
      </Link>
    </div>
  );
}
