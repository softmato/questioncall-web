/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, BellRing, Info, Lock, ShieldCheck } from "lucide-react";

import { LegalDialog } from "@/components/shared/legal-dialog";
import { LogoMark } from "@/components/shared/logo";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

import "./checkout-theme.css";

export type ManualPayment = {
  recipientName: string;
  esewaNumber: string;
  qrCodeUrl: string;
};

type CheckoutShellProps = {
  /** True when served from the checkout subdomain (mobile hand-off). Hides the
   *  in-app "back" nav so it reads as a focused payment gateway. */
  checkoutMode?: boolean;
  backHref?: string;
  backLabel?: string;
  /** Sub-line in the footer "instant access" note. */
  confirmation?: string;
  /** Force the checkout palette regardless of the browser/page theme. Passed
   *  from the app's `?theme=` so the checkout matches the app, not the device.
   *  Undefined → follow next-themes (`.dark` ancestor) on the main website. */
  forcedTheme?: "light" | "dark";
  /** The dynamic product/payment content (summary + form). */
  children: ReactNode;
};

const DEFAULT_INSTRUCTION =
  "Scan the QR code or transfer the total due amount to the eSewa number above, then submit your transaction details below.";
const DEFAULT_CONFIRMATION =
  "Access unlocks the moment your payment is confirmed, and your receipt is emailed to you.";

/**
 * Shared, single-column checkout chrome for every paid surface (course, chapter,
 * subscription). The frame — brand and footer trust row — is static; the
 * summary + payment section (children) is injected per purchase type. The eSewa
 * QR card is {@link ManualPaymentCard}, shown only in the manual fallback. Styling + tokens live in
 * checkout-theme.css and follow the app's light/dark theme.
 */
export function CheckoutShell({
  checkoutMode = false,
  backHref,
  backLabel,
  confirmation = DEFAULT_CONFIRMATION,
  forcedTheme,
  children,
}: CheckoutShellProps) {
  const showBack = !checkoutMode && Boolean(backHref) && Boolean(backLabel);

  return (
    <div
      className={cn(
        "qc-checkout",
        forcedTheme === "dark" && "qc-dark",
        forcedTheme === "light" && "qc-light",
      )}
    >
      <div className="qc-shell">
        {showBack ? (
          <div className="qc-topbar">
            <Link href={backHref!} className="qc-bbtn" aria-label={backLabel}>
              <ArrowLeft size={20} />
            </Link>
          </div>
        ) : null}

        <div className="qc-brand">
          <LogoMark size={24} className="qc-brand-logo rounded-lg" priority />
          {APP_NAME}
        </div>

        {/* Dynamic: order summary + payment form */}
        {children}

        {/* Footer */}
        <div className="qc-footer">
          <div className="qc-notify">
            <span className="qc-notify-ic">
              <BellRing size={20} />
            </span>
            <div className="qc-notify-text">
              <div className="qc-notify-title">Instant access</div>
              <div className="qc-notify-sub">{confirmation}</div>
            </div>
          </div>

          <div className="qc-trust">
            <span className="qc-trust-item">
              <ShieldCheck size={14} /> Secure
            </span>
            <span className="qc-trust-dot" />
            <span className="qc-trust-item">
              <Lock size={14} /> Encrypted
            </span>
          </div>

          <p className="qc-terms">
            By paying, you agree to our{" "}
            <LegalDialog
              triggerClassName=""
              triggerLabel="Terms and Policies"
            />
            . Payments are processed securely by Softmato.
          </p>
        </div>
      </div>
    </div>
  );
}

/** The eSewa QR + recipient, for the manual-transfer fallback only. */
export function ManualPaymentCard({
  manualPayment,
  instruction = DEFAULT_INSTRUCTION,
}: {
  manualPayment: ManualPayment;
  /** Blue info line under the QR. */
  instruction?: string;
}) {
  return (
    <div className="qc-card qc-pay">
      <div className="qc-qr-wrap">
        {manualPayment.qrCodeUrl ? (
          <img
            src={manualPayment.qrCodeUrl}
            alt="eSewa payment QR"
            className="qc-qr"
          />
        ) : (
          <div className="qc-qr-fallback">QR unavailable</div>
        )}
      </div>
      <div className="qc-payee">{manualPayment.recipientName}</div>
      <div className="qc-num">
        <span className="qc-num-label">eSewa</span>
        <span className="qc-num-val">{manualPayment.esewaNumber || "—"}</span>
      </div>
      <div className="qc-note">
        <span className="qc-note-ic">
          <Info size={18} />
        </span>
        <span>{instruction}</span>
      </div>
    </div>
  );
}
