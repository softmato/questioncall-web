"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CreditCardIcon, TicketPercentIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PricingGateProps = {
  courseId: string;
  courseSlug: string;
  pricingModel: "FREE" | "SUBSCRIPTION_INCLUDED" | "PAID";
  price?: number | null;
  hasActiveSubscription: boolean;
  redirectToAfterAccess?: string | null;
  initialCoupon?: { code: string; discountPercentage: number } | null;
  manualPayment?: {
    recipientName: string;
    esewaNumber: string;
    qrCodeUrl: string;
  } | null;
};

export function PricingGate({
  courseId,
  courseSlug,
  pricingModel,
  price,
  hasActiveSubscription,
  redirectToAfterAccess,
  initialCoupon,
}: PricingGateProps) {
  const router = useRouter();
  const [couponCode, setCouponCode] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountPercentage: number } | null>(initialCoupon ?? null);

  const redirectTo = redirectToAfterAccess || `/courses/${courseSlug}`;

  const currentPrice = price || 0;
  const discountedPrice = appliedCoupon
    ? currentPrice * (1 - appliedCoupon.discountPercentage / 100)
    : currentPrice;

  async function enroll(coupon?: string) {
    setIsWorking(true);
    try {
      const response = await fetch(`/api/courses/${courseId}/enroll`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(coupon ? { couponCode: coupon } : {}),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || data.reason || "Unable to enroll.");
      }

      toast.success("Access unlocked.");
      router.push(redirectTo);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to enroll.");
    } finally {
      setIsWorking(false);
    }
  }

  async function applyCoupon() {
    if (!couponCode.trim()) {
      toast.error("Enter a coupon code first.");
      return;
    }

    setIsWorking(true);
    try {
      const validationResponse = await fetch("/api/courses/coupons/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: couponCode.trim(),
          courseId,
        }),
      });

      const validationData = await validationResponse.json().catch(() => ({}));
      if (!validationResponse.ok || validationData.valid === false) {
        throw new Error(
          validationData.reason || validationData.error || "Coupon is not valid.",
        );
      }

      if (validationData.coupon?.discountPercentage === 100) {
        await enroll(couponCode.trim());
      } else {
        setAppliedCoupon({
          code: couponCode.trim(),
          discountPercentage: validationData.coupon?.discountPercentage ?? 0,
        });
        toast.success(`Coupon applied! ${validationData.coupon?.discountPercentage ?? 0}% off.`);
        setIsWorking(false);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Coupon could not be applied.",
      );
      setIsWorking(false);
    }
  }

  const canInstantlyEnroll =
    pricingModel === "FREE" ||
    (pricingModel === "SUBSCRIPTION_INCLUDED" && hasActiveSubscription);

  return (
    <div className="space-y-4 rounded-3xl border border-border bg-background p-5 shadow-sm">
      <div className="space-y-2">
        <div className="text-sm font-semibold text-foreground">Access this course</div>
        {pricingModel === "PAID" ? (
          <p className="text-sm text-muted-foreground">
            Pay manually with eSewa, then submit your transaction proof for admin approval.
          </p>
        ) : pricingModel === "SUBSCRIPTION_INCLUDED" && !hasActiveSubscription ? (
          <p className="text-sm text-muted-foreground">
            An active subscription or a valid coupon is required.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            You can start learning immediately.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-muted/30 p-4">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Course Price
        </div>
        {pricingModel === "PAID" ? (
          <>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-semibold text-foreground">
                NPR {Number(discountedPrice).toFixed(0)}
              </span>
              {appliedCoupon ? (
                <span className="text-sm text-muted-foreground line-through">
                  NPR {Number(currentPrice).toFixed(0)}
                </span>
              ) : null}
            </div>
            {appliedCoupon ? (
              <div className="mt-1 text-sm text-emerald-600 dark:text-emerald-400">
                {appliedCoupon.discountPercentage}% discount applied
              </div>
            ) : null}
          </>
        ) : pricingModel === "FREE" ? (
          <div className="mt-2 text-3xl font-semibold text-emerald-600 dark:text-emerald-400">
            Free
          </div>
        ) : (
          <div className="mt-2 text-2xl font-semibold text-foreground">
            Included in subscription
          </div>
        )}
      </div>

      {canInstantlyEnroll ? (
        <Button
          size="lg"
          className="w-full"
          disabled={isWorking}
          onClick={() => {
            void enroll();
          }}
        >
          Start learning
        </Button>
      ) : null}

      {pricingModel === "SUBSCRIPTION_INCLUDED" && !hasActiveSubscription ? (
        <Button asChild size="lg" className="w-full">
          <Link href="/subscription">View subscription plans</Link>
        </Button>
      ) : null}

      {pricingModel === "PAID" ? (
        <Button asChild size="lg" className="w-full">
          <Link href={`/courses/${courseSlug}/buy`}>
            <CreditCardIcon className="size-4" />
            Purchase Course
          </Link>
        </Button>
      ) : null}

      <div className="space-y-3 rounded-2xl border border-dashed border-border bg-muted/20 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <TicketPercentIcon className="size-4 text-primary" />
          Have a coupon?
        </div>
        {!appliedCoupon ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={couponCode}
              onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
              placeholder="Enter coupon code"
            />
            <Button
              variant="outline"
              disabled={isWorking}
              onClick={() => {
                void applyCoupon();
              }}
            >
              Apply
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-50 p-3 text-sm dark:bg-emerald-950/20">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <span className="font-semibold">{appliedCoupon.code}</span>
              <span>applied ({appliedCoupon.discountPercentage}% off)</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
              onClick={() => {
                setAppliedCoupon(null);
                setCouponCode("");
              }}
            >
              Remove
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
