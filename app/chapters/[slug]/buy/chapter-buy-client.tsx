"use client";

import { FormEvent, useState } from "react";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";

import type { ChapterDetailData } from "@/lib/chapter-page-data";
import { consumeMobileReturn } from "@/components/payment/mobile-return-redirect";
import { SoftmatoPay } from "@/components/payment/softmato-pay-button";
import { CheckoutShell } from "@/components/checkout/checkout-shell";
import { UploadProgressBar } from "@/components/shared/upload-progress-bar";
import { postMultipartWithProgress } from "@/lib/client-upload";
import { useRouter } from "next/navigation";

type Props = {
  chapter: ChapterDetailData;
  /** True when served from the checkout subdomain (mobile hand-off). */
  checkoutMode?: boolean;
  /** Force the palette to match the app's theme (from `?theme=`). */
  forcedTheme?: "light" | "dark";
};

export function ChapterBuyClient({
  chapter,
  checkoutMode = false,
  forcedTheme,
}: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const price = chapter.price ?? 0;

  async function handlePaymentSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      const screenshot = formData.get("screenshot");
      const hasScreenshot = screenshot instanceof File && screenshot.size > 0;
      setUploadProgress(hasScreenshot ? 0 : null);

      const data = await postMultipartWithProgress<{ message?: string }>(
        `/api/chapters/${chapter._id}/purchase/initiate`,
        formData,
        hasScreenshot
          ? { onProgress: ({ percent }) => setUploadProgress(percent) }
          : {},
      );

      toast.success(data.message || "Payment proof submitted for review.");
      // Manual proof awaits admin review → return as "submitted", not "success".
      if (consumeMobileReturn("submitted", "manual")) return;
      router.push(`/chapters/${chapter.slug}`);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Payment proof could not be submitted.",
      );
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  }

  return (
    <CheckoutShell
      checkoutMode={checkoutMode}
      backHref={`/chapters/${chapter.slug}`}
      backLabel="Back to chapter"
      forcedTheme={forcedTheme}
    >
      {/* Order summary */}
      <div className="qc-sec-label">Order summary</div>
      <div className="qc-card qc-summary">
        <div className="qc-course">
          <div>
            <div className="qc-course-title">{chapter.title}</div>
            <div className="qc-course-sub">
              {chapter.subject} · {chapter.level}
            </div>
          </div>
        </div>

        <div className="qc-line">
          <span>Chapter price</span>
          <span>NPR {price.toFixed(2)}</span>
        </div>
        <div className="qc-due">
          <span>Due today</span>
          <strong>NPR {price.toFixed(2)}</strong>
        </div>
      </div>

      {/* Pending notice */}
      {chapter.pendingPurchase ? (
        <div className="qc-pending">
          A payment proof for this chapter is already pending admin review.
        </div>
      ) : null}

      <SoftmatoPay
        kind="chapter"
        id={chapter._id}
        disabled={chapter.pendingPurchase}
        manualPayment={chapter.manualPayment}
        manual={
          <div className="qc-card">
            <form onSubmit={(e) => void handlePaymentSubmit(e)} className="qc-form">
              <div className="qc-field">
                <label className="qc-field-label" htmlFor="chapter-transaction-id">
                  eSewa Transaction ID
                </label>
                <input
                  className="qc-input"
                  id="chapter-transaction-id"
                  name="transactionId"
                  required
                  placeholder="e.g. 1AK39BXX"
                  disabled={isSubmitting}
                />
              </div>

              <div className="qc-field">
                <label className="qc-field-label" htmlFor="chapter-transactor-name">
                  Transactor full name
                </label>
                <input
                  className="qc-input"
                  id="chapter-transactor-name"
                  name="transactorName"
                  required
                  placeholder="Full name used in eSewa"
                  disabled={isSubmitting}
                />
              </div>

              <div className="qc-field">
                <label className="qc-field-label" htmlFor="chapter-screenshot">
                  Payment screenshot
                  <span className="qc-field-hint">(optional but recommended)</span>
                </label>
                <input
                  className="qc-input"
                  id="chapter-screenshot"
                  name="screenshot"
                  type="file"
                  accept="image/*"
                  disabled={isSubmitting}
                />
              </div>

              {isSubmitting && uploadProgress !== null && (
                <UploadProgressBar
                  label="Uploading screenshot…"
                  value={uploadProgress}
                />
              )}

              <button
                type="submit"
                className="qc-submit"
                disabled={isSubmitting || chapter.pendingPurchase}
              >
                <CreditCard size={18} />
                {isSubmitting ? "Submitting…" : "Submit payment proof"}
              </button>
            </form>
          </div>
        }
      />
    </CheckoutShell>
  );
}
