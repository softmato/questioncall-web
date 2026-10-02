"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Circle, Loader2, ShieldCheck, Wallet, XCircle } from "lucide-react";

import { ManualPaymentCard, type ManualPayment } from "@/components/checkout/checkout-shell";
import { LogoMark } from "@/components/shared/logo";

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

/** The checkout route's answer: its JSON refusal, or the last line of its stream. */
type Answer = { checkoutUrl?: string; error?: string; manualFallback?: boolean };

/** `invoice` and `session` are streamed by the route as each Softmato call starts. */
const STEPS = [
  { id: "connect", label: "Making a secure connection" },
  { id: "invoice", label: "Preparing your invoice" },
  { id: "session", label: "Setting up your payment" },
  { id: "redirect", label: "Opening Softmato checkout" },
];

/**
 * Online-first payment: one "Pay online" button to Softmato's hosted checkout.
 * The manual eSewa transfer stays hidden unless the checkout API reports
 * Softmato unavailable (`manualFallback`), so it is a last resort, not a choice.
 *
 * Pressing it covers the page with the hand-off HostelPalika uses
 * (checkout-handoff.tsx there): the steps move when the server says that work
 * has started, never on a timer, and the screen stays up until Softmato's page
 * replaces it.
 */
export function SoftmatoPay({ kind, id, planSlug, couponCode, disabled, manualPayment, instruction, manual }: Props) {
  const [run, setRun] = useState<{ active: number; error: string } | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  // Back from Softmato can restore this page from the back-forward cache
  // exactly as it was left: mid-redirect, spinner and all.
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setRun(null);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  async function pay() {
    setRun({ active: 0, error: "" });
    const reach = (step: string) =>
      setRun((current) => current && { ...current, active: Math.max(current.active, STEPS.findIndex((s) => s.id === step)) });

    try {
      const res = await fetch("/api/payments/softmato/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, planSlug, couponCode }),
      });
      const answer: Answer = res.headers.get("content-type")?.includes("ndjson")
        ? await readSteps(res, reach)
        : await res.json().catch(() => ({}));

      if (answer.checkoutUrl) {
        reach("redirect");
        window.location.assign(answer.checkoutUrl);
        return;
      }
      if (answer.manualFallback) setManualOpen(true);
      throw new Error(answer.error || "Could not start payment.");
    } catch (error) {
      setRun((current) => ({
        active: current?.active ?? 0,
        error: error instanceof Error ? error.message : "Could not start payment.",
      }));
    }
  }

  return (
    <>
      <div className="qc-sec-label">Payment</div>
      <div className="qc-card">
        <button type="button" className="qc-submit" onClick={() => void pay()} disabled={disabled || Boolean(run && !run.error)}>
          <Wallet size={18} />
          Pay online
        </button>
      </div>

      {run ? <Handoff {...run} onClose={() => setRun(null)} onRetry={() => void pay()} /> : null}

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

/** Reads the route's NDJSON: every `{ step }` line as it arrives, then the answer line. */
async function readSteps(res: Response, onStep: (step: string) => void): Promise<Answer> {
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  while (reader) {
    const { done, value } = await reader.read();
    buffered += decoder.decode(value, { stream: !done });
    const lines = buffered.split("\n");
    buffered = done ? "" : (lines.pop() ?? "");

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as Answer & { step?: string };
      if (event.step) onStep(event.step);
      else return event;
    }
    if (done) break;
  }

  return { error: "The connection dropped before checkout opened. Please try again." };
}

function Handoff({
  active,
  error,
  onClose,
  onRetry,
}: {
  active: number;
  error: string;
  onClose: () => void;
  onRetry: () => void;
}) {
  const retry = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (error) retry.current?.focus();
  }, [error]);

  return (
    <div className="qc-handoff" role="dialog" aria-modal="true" aria-labelledby="qc-handoff-title">
      <div className="qc-handoff-box">
        <div className={error ? "qc-handoff-mark" : "qc-handoff-mark is-busy"}>
          <LogoMark size={36} className="rounded-lg" />
        </div>
        <h3 className="qc-handoff-title" id="qc-handoff-title">
          {error ? "The checkout did not open" : "Preparing your secure checkout"}
        </h3>
        <p className={error ? "qc-handoff-sub is-error" : "qc-handoff-sub"}>
          {error || "You finish paying on Softmato, our company's checkout, in this same tab — then come straight back here."}
        </p>

        <ol className="qc-handoff-steps" aria-live="polite">
          {STEPS.map((step, index) => {
            const state = index < active ? "done" : index > active ? "waiting" : error ? "failed" : "active";
            return (
              <li key={step.id} className={`qc-handoff-step is-${state}`}>
                {state === "done" ? (
                  <CheckCircle2 size={20} />
                ) : state === "active" ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : state === "failed" ? (
                  <XCircle size={20} />
                ) : (
                  <Circle size={20} />
                )}
                <span>{step.label}</span>
              </li>
            );
          })}
        </ol>

        {error ? (
          <div className="qc-handoff-actions">
            <button type="button" className="qc-handoff-btn" onClick={onClose}>
              Close
            </button>
            <button type="button" className="qc-handoff-btn is-primary" onClick={onRetry} ref={retry}>
              Try again
            </button>
          </div>
        ) : (
          <div className="qc-handoff-trust">
            <ShieldCheck size={16} />
            Secured by Softmato
          </div>
        )}
      </div>
    </div>
  );
}
