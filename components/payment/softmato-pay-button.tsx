"use client";

import { useState, type ReactNode } from "react";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { ManualPaymentCard, type ManualPayment } from "@/components/checkout/checkout-shell";

type Props = {
  kind: "subscription" | "course" | "chapter";
  /** Course/chapter _id. */
  id?: string;
  planSlug?: string;
  couponCode?: string | null;
  disabled?: boolean;
  /** eSewa QR/recipient for the fallback. */
  manualPayment: ManualPayment;
  instruction?: string;
  /** The manual proof form. Only rendered once Softmato is unreachable. */
  manual: ReactNode;
};

/**
 * Online-first payment: one "Pay online" button to Softmato's hosted checkout.
 * The manual eSewa transfer stays hidden unless the checkout API reports
 * Softmato unavailable (`manualFallback`), so it is a last resort, not a choice.
 */
export function SoftmatoPay({ kind, id, planSlug, couponCode, disabled, manualPayment, instruction, manual }: Props) {
  const [loading, setLoading] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  async function pay() {
    setLoading(true);
    try {
      const res = await fetch("/api/payments/softmato/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, planSlug, couponCode }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        checkoutUrl?: string;
        error?: string;
        manualFallback?: boolean;
      };
      if (res.ok && data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      if (data.manualFallback) setManualOpen(true);
      throw new Error(data.error || "Could not start payment.");
    } catch (error) {
      setLoading(false);
      toast.error(error instanceof Error ? error.message : "Could not start payment.");
    }
  }

  return (
    <>
      <div className="qc-sec-label">Payment</div>
      <div className="qc-card">
        <button type="button" className="qc-submit" onClick={() => void pay()} disabled={disabled || loading}>
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Wallet size={18} />}
          {loading ? "Opening secure checkout…" : "Pay online"}
        </button>
      </div>

      {manualOpen ? (
        <>
          <div className="qc-pending">
            Online payment is unavailable right now. You can pay by eSewa transfer instead — we&apos;ll verify it by hand.
          </div>
          <div className="qc-sec-label">Pay manually</div>
          <ManualPaymentCard manualPayment={manualPayment} instruction={instruction} />
          <div className="qc-sec-label">Your payment details</div>
          {manual}
        </>
      ) : null}
    </>
  );
}
