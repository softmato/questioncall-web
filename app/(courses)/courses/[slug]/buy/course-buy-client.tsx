"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, CreditCard, TicketPercent } from "lucide-react";
import { toast } from "sonner";

import { UploadProgressBar } from "@/components/shared/upload-progress-bar";
import { CheckoutShell } from "@/components/checkout/checkout-shell";
import { postMultipartWithProgress } from "@/lib/client-upload";
import { consumeMobileReturn } from "@/components/payment/mobile-return-redirect";
import { SoftmatoPay } from "@/components/payment/softmato-pay-button";
import type { CourseDetailData } from "@/lib/course-page-data";

type Props = {
  course: CourseDetailData | null;
  isAuthenticated: boolean;
  /** True when served from the checkout subdomain (mobile hand-off). */
  checkoutMode?: boolean;
  /** Force the palette to match the app's theme (from `?theme=`). */
  forcedTheme?: "light" | "dark";
};

export function CourseBuyClient({
  course,
  isAuthenticated,
  checkoutMode = false,
  forcedTheme,
}: Props) {
  const router = useRouter();

  const [couponCode, setCouponCode] = useState("");
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountPercentage: number;
  } | null>(course?.appliedCoupon ?? null);

  if (!course) {
    return (
      <div className="qc-checkout">
        <div className="qc-shell">
          <div className="qc-state">
            <h1 className="qc-state-title">Course not found</h1>
            <p className="qc-state-sub">
              This course may have been removed or is not available.
            </p>
            <Link
              href="/courses"
              className="qc-submit"
              style={{ marginTop: 22 }}
            >
              Browse courses
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const continueHref = course.nextVideoId
    ? `/courses/${course.slug}/watch/${course.nextVideoId}`
    : `/courses/${course.slug}`;

  const basePrice = course.price ?? 0;
  const discountedPrice = appliedCoupon
    ? basePrice * (1 - appliedCoupon.discountPercentage / 100)
    : basePrice;

  async function handleCouponApply() {
    if (!couponCode.trim()) {
      toast.error("Enter a coupon code first.");
      return;
    }
    setIsValidatingCoupon(true);
    try {
      const res = await fetch("/api/courses/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: couponCode.trim(),
          courseId: course!._id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.valid === false) {
        throw new Error(data.reason || data.error || "Coupon is not valid.");
      }

      if (data.coupon?.discountPercentage === 100) {
        // 100% coupon → enroll directly
        setIsSubmitting(true);
        const enrollRes = await fetch(`/api/courses/${course!._id}/enroll`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ couponCode: couponCode.trim() }),
        });
        const enrollData = await enrollRes.json().catch(() => ({}));
        if (!enrollRes.ok)
          throw new Error(enrollData.error || "Unable to enroll.");
        toast.success("Access unlocked!");
        // Access is granted immediately for a 100% coupon → return as success.
        if (consumeMobileReturn("success")) return;
        router.push(continueHref);
        router.refresh();
      } else {
        setAppliedCoupon({
          code: couponCode.trim(),
          discountPercentage: data.coupon?.discountPercentage ?? 0,
        });
        toast.success(
          `Coupon applied! ${data.coupon?.discountPercentage ?? 0}% off.`,
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Coupon could not be applied.",
      );
    } finally {
      setIsValidatingCoupon(false);
      setIsSubmitting(false);
    }
  }

  async function handlePaymentSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      if (appliedCoupon) formData.append("couponCode", appliedCoupon.code);

      const screenshot = formData.get("screenshot");
      const hasScreenshot = screenshot instanceof File && screenshot.size > 0;
      setUploadProgress(hasScreenshot ? 0 : null);

      const data = await postMultipartWithProgress<{ message?: string }>(
        `/api/courses/${course!._id}/purchase/initiate`,
        formData,
        hasScreenshot
          ? { onProgress: ({ percent }) => setUploadProgress(percent) }
          : {},
      );

      toast.success(data.message || "Payment proof submitted for review.");
      // Manual proof awaits admin review → return as "submitted", not "success".
      if (consumeMobileReturn("submitted", "manual")) return;
      router.push(`/courses/${course!.slug}`);
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

  // If already has access
  if (course.hasAccess) {
    return (
      <div className="qc-checkout">
        <div className="qc-shell">
          <div className="qc-state">
            <CheckCircle2
              className="mx-auto mb-4"
              style={{ color: "var(--accent)" }}
              size={44}
            />
            <h1 className="qc-state-title">You already have access!</h1>
            <p className="qc-state-sub">
              This course is already unlocked for your account.
            </p>
            <Link
              href={continueHref}
              className="qc-submit"
              style={{ marginTop: 22 }}
            >
              Continue course
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // If not authenticated
  if (!isAuthenticated) {
    return (
      <div className="qc-checkout">
        <div className="qc-shell">
          <div className="qc-state">
            <h1 className="qc-state-title">Sign in to purchase</h1>
            <p className="qc-state-sub">
              You need an account to buy this course.
            </p>
            <Link
              href="/auth/signin"
              className="qc-submit"
              style={{ marginTop: 22 }}
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CheckoutShell
      checkoutMode={checkoutMode}
      backHref={`/courses/${course.slug}`}
      backLabel="Back to course"
      forcedTheme={forcedTheme}
    >
      {/* Order summary */}
      <div className="qc-sec-label">Order summary</div>
      <div className="qc-card qc-summary">
        <div className="qc-course">
          <div>
            <div className="qc-course-title">{course.title}</div>
            <div className="qc-course-sub">
              {course.subject} · {course.level}
            </div>
          </div>
        </div>

        <div className="qc-line">
          <span>Course price</span>
          <span>NPR {basePrice.toFixed(2)}</span>
        </div>
        {appliedCoupon ? (
          <div className="qc-line qc-line-disc">
            <span>Coupon ({appliedCoupon.discountPercentage}% off)</span>
            <span>- NPR {(basePrice - discountedPrice).toFixed(2)}</span>
          </div>
        ) : null}
        <div className="qc-due">
          <span>Due today</span>
          <strong>NPR {discountedPrice.toFixed(2)}</strong>
        </div>

        {/* Coupon */}
        <div className="qc-coupon">
          <div className="qc-coupon-head">
            <span className="qc-coupon-ic">
              <TicketPercent size={18} />
            </span>
            Have a coupon?
          </div>
          {!appliedCoupon ? (
            <div className="qc-coupon-entry">
              <input
                className="qc-input qc-coupon-input"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="Enter code"
                disabled={isValidatingCoupon || isSubmitting}
              />
              <button
                type="button"
                className="qc-btn-ghost"
                onClick={() => void handleCouponApply()}
                disabled={isValidatingCoupon || isSubmitting}
              >
                {isValidatingCoupon ? "Checking…" : "Apply"}
              </button>
            </div>
          ) : (
            <div className="qc-coupon-applied">
              <span className="qc-coupon-badge">
                <Check size={17} />
              </span>
              <div className="qc-coupon-info">
                <span className="qc-coupon-code">{appliedCoupon.code}</span>
                <span className="qc-coupon-desc">
                  {appliedCoupon.discountPercentage}% off applied
                </span>
              </div>
              <button
                type="button"
                className="qc-btn-ghost"
                onClick={() => {
                  setAppliedCoupon(null);
                  setCouponCode("");
                }}
              >
                Remove
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pending notice */}
      {course.pendingPurchase ? (
        <div className="qc-pending">
          A payment proof for this course is already pending admin review.
        </div>
      ) : null}

      <SoftmatoPay
        kind="course"
        id={course._id}
        couponCode={appliedCoupon?.code}
        disabled={course.pendingPurchase}
        manualPayment={course.manualPayment}
        manual={
          <div className="qc-card">
            <form onSubmit={(e) => void handlePaymentSubmit(e)} className="qc-form">
              <div className="qc-field">
                <label className="qc-field-label" htmlFor="course-transaction-id">
                  eSewa Transaction ID
                </label>
                <input
                  className="qc-input"
                  id="course-transaction-id"
                  name="transactionId"
                  required
                  placeholder="e.g. 1AK39BXX"
                  disabled={isSubmitting}
                />
              </div>

              <div className="qc-field">
                <label className="qc-field-label" htmlFor="course-transactor-name">
                  Transactor full name
                </label>
                <input
                  className="qc-input"
                  id="course-transactor-name"
                  name="transactorName"
                  required
                  placeholder="Full name used in eSewa"
                  disabled={isSubmitting}
                />
              </div>

              <div className="qc-field">
                <label className="qc-field-label" htmlFor="course-screenshot">
                  Payment screenshot
                  <span className="qc-field-hint">(optional but recommended)</span>
                </label>
                <input
                  className="qc-input"
                  id="course-screenshot"
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
                disabled={isSubmitting || course.pendingPurchase}
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
