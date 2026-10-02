import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { getSafeServerSession } from "@/lib/auth";
import { CheckoutShell } from "@/components/checkout/checkout-shell";
import { TransactionModal } from "@/components/payment/transaction-modal";
import { SoftmatoPay } from "@/components/payment/softmato-pay-button";
import {
  getHydratedPlans,
  getManualPaymentDetails,
  getPlatformConfig,
} from "@/models/PlatformConfig";
import { isCheckoutRequest } from "@/lib/checkout-host.server";
import {
  applySubscriptionCouponDiscount,
  validateSubscriptionCoupon,
} from "@/lib/subscription-coupons";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; coupon?: string }>;
}) {
  const [session, isCheckout] = await Promise.all([
    getSafeServerSession(),
    isCheckoutRequest(),
  ]);

  // Route security
  if (!session?.user) {
    redirect("/login");
  }
  // Unwrap search params asynchronously properly for Next.js latest dynamic constraints
  const { plan: planQuery, coupon: couponQuery } = await searchParams;

  // Retrieve plan safely, defaulting to the 1 Month Plan if not found
  const config = await getPlatformConfig();
  const hydratedPlans = getHydratedPlans(config);
  const manualPayment = getManualPaymentDetails(config);

  const planSlug = planQuery || "1month";
  const plan =
    hydratedPlans.find((p) => p.slug === planSlug) || hydratedPlans[1];

  // Optional subscription coupon (percentage) — server-side validation only;
  // the same code is re-validated and re-priced in /api/payments/manual.
  let couponCode: string | null = null;
  let couponDiscount = 0;
  if (couponQuery?.trim()) {
    const validation = await validateSubscriptionCoupon({
      code: couponQuery,
      userId: session.user.id,
      userEmail: session.user.email,
      planSlug: plan.slug,
    });
    if (
      validation.valid &&
      validation.coupon.kind === "PERCENTAGE" &&
      typeof validation.coupon.discountPercentage === "number"
    ) {
      couponCode = validation.coupon.code;
      couponDiscount =
        plan.price -
        applySubscriptionCouponDiscount(
          plan.price,
          validation.coupon.discountPercentage,
        );
    }
  }

  const effectivePrice = plan.price - couponDiscount;
  const subscriptionValue =
    plan.originalPrice && plan.price < plan.originalPrice
      ? plan.originalPrice
      : plan.price;
  const hasDiscount = Boolean(
    plan.originalPrice && plan.price < plan.originalPrice,
  );

  return (
    <CheckoutShell
      checkoutMode={isCheckout}
      backHref="/subscription"
      backLabel="Configure your plan"
      confirmation="We'll email you the moment your plan is activated."
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
                style={{
                  color: "var(--accent)",
                  flex: "0 0 auto",
                  marginTop: 1,
                }}
              />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

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
        {couponCode ? (
          <div className="qc-line qc-line-disc">
            <span>Coupon {couponCode}</span>
            <span>- NPR {couponDiscount.toFixed(2)}</span>
          </div>
        ) : null}
        <div className="qc-line">
          <span>Estimated tax</span>
          <span>NPR {plan.tax.toFixed(2)}</span>
        </div>
        <div className="qc-due">
          <span>Due today</span>
          <strong>NPR {(effectivePrice + plan.tax).toFixed(2)}</strong>
        </div>
      </div>

      <SoftmatoPay
        kind="subscription"
        planSlug={plan.slug}
        couponCode={couponCode}
        manualPayment={manualPayment}
        instruction="Scan the QR code or transfer the total due amount to the eSewa number above, then confirm your transaction below."
        manual={
          <div className="qc-card">
            <TransactionModal
              planSlug={plan.slug}
              couponCode={couponCode}
              triggerClassName="qc-submit"
              triggerLabel="I have paid — submit details"
            />
          </div>
        }
      />
    </CheckoutShell>
  );
}
