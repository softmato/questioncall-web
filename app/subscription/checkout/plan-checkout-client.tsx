"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CreditCard } from "lucide-react";
import { toast } from "sonner";

import { CheckoutShell } from "@/components/checkout/checkout-shell";
import { UploadProgressBar } from "@/components/shared/upload-progress-bar";
import { postMultipartWithProgress } from "@/lib/client-upload";
import { consumeMobileReturn } from "@/components/payment/mobile-return-redirect";
import { SoftmatoPay } from "@/components/payment/softmato-pay-button";

type Plan = {
  slug: string;
  name: string;
  price: number;
  tax: number;
  originalPrice: number | null;
  features: string[];
};

type Props = {
  plan: Plan;
  couponCode?: string | null;
  manualPayment: {
    recipientName: string;
    esewaNumber: string;
    qrCodeUrl: string;
  };
  checkoutMode?: boolean;
  forcedTheme?: "light" | "dark";
};

export function PlanCheckoutClient({
  plan,
  couponCode = null,
  manualPayment,
  checkoutMode = false,
  forcedTheme,
}: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const hasDiscount = Boolean(plan.originalPrice && plan.price < plan.originalPrice);
  const subscriptionValue = hasDiscount ? plan.originalPrice! : plan.price;
  const dueToday = plan.price + plan.tax;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      formData.append("planSlug", plan.slug);
      if (couponCode) {
        formData.append("couponCode", couponCode);
      }

      const screenshot = formData.get("screenshot");
      const hasScreenshot = screenshot instanceof File && screenshot.size > 0;
      setUploadProgress(hasScreenshot ? 0 : null);

      const data = await postMultipartWithProgress<{ message?: string }>(
        "/api/payments/manual",
        formData,
        hasScreenshot ? { onProgress: ({ percent }) => setUploadProgress(percent) } : {},
      );

      toast.success(data.message || "Payment details submitted for review.");
      // Manual proof awaits admin review → return as "submitted", not "success".
      if (consumeMobileReturn("submitted", "manual")) return;
      router.push("/subscription");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Payment details could not be submitted.",
      );
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  }

  return (
    <CheckoutShell
      checkoutMode={checkoutMode}
      backHref="/subscription"
      backLabel="Configure your plan"
      confirmation="We'll email you the moment your plan is activated."
      forcedTheme={forcedTheme}
    >
      {/* Plan summary */}
      <div className="qc-sec-label">Plan summary</div>
      <div className="qc-card qc-summary">
        <div className="qc-course">
          <div>
            <div className="qc-course-title">{plan.name}</div>
            <div className="qc-course-sub">QuestionCall membership</div>
          </div>
        </div>

        {plan.features.length > 0 ? (
          <ul
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 11,
              margin: "15px 0 4px",
            }}
          >
            {plan.features.map((feature, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  gap: 10,
                  fontSize: 13.5,
                  color: "var(--text-2)",
                  lineHeight: 1.4,
                }}
              >
                <CheckCircle2
                  size={17}
                  style={{ color: "var(--accent)", flex: "0 0 auto", marginTop: 1 }}
                />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="qc-line" style={{ marginTop: 8 }}>
          <span>Subscription value</span>
          <span>NPR {subscriptionValue.toFixed(2)}</span>
        </div>
        {hasDiscount ? (
          <div className="qc-line qc-line-disc">
            <span>Discount applied</span>
            <span>- NPR {(plan.originalPrice! - plan.price).toFixed(2)}</span>
          </div>
        ) : null}
        <div className="qc-line">
          <span>Estimated tax</span>
          <span>NPR {plan.tax.toFixed(2)}</span>
        </div>
        <div className="qc-due">
          <span>Due today</span>
          <strong>NPR {dueToday.toFixed(2)}</strong>
        </div>
      </div>

      <SoftmatoPay
        kind="subscription"
        planSlug={plan.slug}
        couponCode={couponCode}
        manualPayment={manualPayment}
        manual={
          <div className="qc-card">
            <form onSubmit={(e) => void handleSubmit(e)} className="qc-form">
              <div className="qc-field">
                <label className="qc-field-label" htmlFor="plan-transaction-id">
                  eSewa Transaction ID
                </label>
                <input
                  className="qc-input"
                  id="plan-transaction-id"
                  name="transactionId"
                  required
                  placeholder="e.g. 1AK39BXX"
                  disabled={isSubmitting}
                />
              </div>

              <div className="qc-field">
                <label className="qc-field-label" htmlFor="plan-transactor-name">
                  Transactor full name
                </label>
                <input
                  className="qc-input"
                  id="plan-transactor-name"
                  name="transactorName"
                  required
                  placeholder="Full name used in eSewa"
                  disabled={isSubmitting}
                />
              </div>

              <div className="qc-field">
                <label className="qc-field-label" htmlFor="plan-screenshot">
                  Payment screenshot
                  <span className="qc-field-hint">(optional but recommended)</span>
                </label>
                <input
                  className="qc-input"
                  id="plan-screenshot"
                  name="screenshot"
                  type="file"
                  accept="image/*"
                  disabled={isSubmitting}
                />
              </div>

              {isSubmitting && uploadProgress !== null && (
                <UploadProgressBar label="Uploading screenshot…" value={uploadProgress} />
              )}

              <button type="submit" className="qc-submit" disabled={isSubmitting}>
                <CreditCard size={18} />
                {isSubmitting ? "Submitting…" : "Submit payment details"}
              </button>
            </form>
          </div>
        }
      />
    </CheckoutShell>
  );
}
