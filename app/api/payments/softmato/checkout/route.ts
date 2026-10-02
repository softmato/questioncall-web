import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";

import { getSafeServerSession } from "@/lib/auth";
import { validateCourseCoupon } from "@/lib/course-coupons";
import { connectToDatabase } from "@/lib/mongodb";
import { getSoftmato, toPaisa } from "@/lib/payment/softmato";
import {
  applySubscriptionCouponDiscount,
  SUBSCRIPTION_COUPON_FAILURE_MESSAGES,
  validateSubscriptionCoupon,
} from "@/lib/subscription-coupons";
import Chapter from "@/models/Chapter";
import ChapterEnrollment from "@/models/ChapterEnrollment";
import Course from "@/models/Course";
import CourseEnrollment from "@/models/CourseEnrollment";
import { getHydratedPlans, getPlatformConfig } from "@/models/PlatformConfig";
import Transaction from "@/models/Transaction";
import User from "@/models/User";

type Body = {
  kind?: "subscription" | "course" | "chapter";
  id?: string;
  planSlug?: string;
  couponCode?: string | null;
};

type Order = {
  type: "DEBIT" | "COURSE_PURCHASE" | "CHAPTER_PURCHASE";
  /** NPR, what the customer is charged. */
  amount: number;
  title: string;
  billingPeriod?: string;
  /** Identifies "same item, same coupon" so repeat clicks reuse one invoice. */
  itemKey: string;
  returnHref: string;
  meta?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

const round = (value: number) => Math.round(value * 100) / 100;
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function commissionFor(instructorId: string) {
  const [instructor, config] = await Promise.all([
    User.findById(instructorId).select("role").lean<{ role?: string }>(),
    getPlatformConfig(),
  ]);
  return instructor?.role === "ADMIN" ? 0 : round(config.coursePurchaseCommissionPercent ?? 0);
}

async function subscriptionOrder(userId: string, email: string | null | undefined, body: Body): Promise<Order | NextResponse> {
  const plan = getHydratedPlans(await getPlatformConfig()).find((p) => p.slug === body.planSlug);
  if (!plan) return fail("Invalid plan selected");

  const user = await User.findById(userId).select("subscriptionStatus subscriptionEnd").lean<{
    subscriptionStatus?: string;
    subscriptionEnd?: Date;
  }>();
  if (user?.subscriptionStatus === "ACTIVE" && user.subscriptionEnd && user.subscriptionEnd > new Date()) {
    return fail("Subscription already active");
  }

  let price = plan.price;
  let couponMeta: Record<string, unknown> = {};
  const code = body.couponCode?.trim();
  if (code) {
    const validation = await validateSubscriptionCoupon({ code, userId, userEmail: email, planSlug: plan.slug });
    if (!validation.valid) return fail(SUBSCRIPTION_COUPON_FAILURE_MESSAGES[validation.reason]);
    if (validation.coupon.kind !== "PERCENTAGE" || typeof validation.coupon.discountPercentage !== "number") {
      return fail("This coupon grants free access — redeem it on the subscription page instead of paying.");
    }
    price = applySubscriptionCouponDiscount(plan.price, validation.coupon.discountPercentage);
    couponMeta = {
      subscriptionCouponId: validation.couponId,
      subscriptionCouponCode: validation.coupon.code,
      subscriptionCouponDiscountPercentage: validation.coupon.discountPercentage,
      subscriptionOriginalPrice: plan.price,
    };
  }

  return {
    type: "DEBIT",
    amount: price + plan.tax,
    title: `${plan.name} plan`,
    billingPeriod: `${plan.durationDays} days`,
    itemKey: `plan:${plan.slug}:${code ?? ""}`,
    returnHref: "/subscription",
    meta: { planSlug: plan.slug, durationDays: plan.durationDays, ...couponMeta },
  };
}

async function courseOrder(userId: string, body: Body): Promise<Order | NextResponse> {
  const course = await Course.findById(body.id)
    .select("_id title slug instructorId pricingModel price status")
    .lean<{ _id: Types.ObjectId; title: string; slug: string; instructorId: unknown; pricingModel: string; price?: number; status: string }>();
  if (!course || course.status !== "ACTIVE") return fail("Course not found.", 404);
  if (course.pricingModel !== "PAID" || !course.price || course.price <= 0) return fail("This course is not paid.");
  if (await CourseEnrollment.exists({ courseId: course._id, studentId: userId })) return fail("COURSE_ALREADY_UNLOCKED");

  let gross = round(course.price);
  let discountPercentage = 0;
  const code = body.couponCode?.trim().toUpperCase();
  if (code) {
    const validation = await validateCourseCoupon({ code, courseId: course._id.toString(), studentId: userId });
    if (!validation.valid) return fail("Invalid or expired coupon.");
    discountPercentage = validation.coupon?.discountPercentage ?? 0;
    gross = round(gross * (1 - discountPercentage / 100));
  }

  const instructorId = String((course.instructorId as { _id?: unknown })?._id ?? course.instructorId);
  const commissionPercent = await commissionFor(instructorId);

  return {
    type: "COURSE_PURCHASE",
    amount: gross,
    title: course.title,
    itemKey: `course:${course._id}:${code ?? ""}`,
    returnHref: `/courses/${course.slug}`,
    metadata: {
      courseId: course._id.toString(),
      courseName: course.title,
      instructorId,
      pricingModel: course.pricingModel,
      grossAmount: gross,
      commissionPercent,
      netAmount: round(gross * (1 - commissionPercent / 100)),
      studentId: userId,
      ...(code ? { couponCode: code, discountPercentage } : {}),
    },
  };
}

async function chapterOrder(userId: string, body: Body): Promise<Order | NextResponse> {
  const chapter = await Chapter.findById(body.id)
    .select("_id title slug instructorId pricingModel price status")
    .lean<{ _id: Types.ObjectId; title: string; slug: string; instructorId: unknown; pricingModel: string; price?: number; status: string }>();
  if (!chapter || chapter.status !== "ACTIVE") return fail("Chapter not found.", 404);
  if (chapter.pricingModel !== "PAID" || !chapter.price || chapter.price <= 0) return fail("This chapter is not paid.");
  if (await ChapterEnrollment.exists({ chapterId: chapter._id, studentId: userId })) return fail("CHAPTER_ALREADY_UNLOCKED");

  const gross = round(chapter.price);
  const instructorId = String(chapter.instructorId);
  const commissionPercent = await commissionFor(instructorId);

  return {
    type: "CHAPTER_PURCHASE",
    amount: gross,
    title: chapter.title,
    itemKey: `chapter:${chapter._id}`,
    returnHref: `/chapters/${chapter.slug}`,
    metadata: {
      chapterId: chapter._id.toString(),
      chapterName: chapter.title,
      instructorId,
      pricingModel: chapter.pricingModel,
      grossAmount: gross,
      commissionPercent,
      netAmount: round(gross * (1 - commissionPercent / 100)),
    },
  };
}

/**
 * Start a Softmato hosted checkout: price the item server-side, raise (or reuse)
 * an invoice, and hand back a 30-minute checkout URL. Provisioning happens only
 * in settleSoftmatoInvoice, from the webhook or the return page.
 *
 * Refusals are plain JSON errors. Once the order is good, the answer streams as
 * NDJSON: a `{ step }` line right before each Softmato call, so the hand-off
 * screen in SoftmatoPay moves on real work, then one last line shaped like the
 * old JSON body (`{ checkoutUrl }` or `{ error, manualFallback }`).
 */
export async function POST(req: NextRequest) {
  const session = await getSafeServerSession();
  const user = session?.user;
  if (!user?.id) return fail("Unauthorized", 401);

  const body = (await req.json().catch(() => ({}))) as Body;
  if (body.kind !== "subscription") {
    if (user.role !== "STUDENT") return fail("Only students can make purchases.", 403);
    if (!body.id || !Types.ObjectId.isValid(body.id)) return fail("Invalid id.");
  }

  await connectToDatabase();

  const order =
    body.kind === "subscription"
      ? await subscriptionOrder(user.id, user.email, body)
      : body.kind === "course"
        ? await courseOrder(user.id, body)
        : body.kind === "chapter"
          ? await chapterOrder(user.id, body)
          : fail("Unknown checkout kind.");
  if (order instanceof NextResponse) return order;
  if (order.amount <= 0) return fail("Nothing to pay for this item.");

  const existing = await Transaction.findOne({
    userId: user.id,
    gateway: "SOFTMATO",
    status: "PENDING",
    type: order.type,
    amount: order.amount,
    "meta.itemKey": order.itemKey,
  });
  const txn =
    existing ??
    (await Transaction.create({
      userId: user.id,
      type: order.type,
      amount: order.amount,
      status: "PENDING",
      gateway: "SOFTMATO",
      meta: { ...order.meta, itemKey: order.itemKey, returnHref: order.returnHref },
      metadata: order.metadata,
    }));

  // Return to whichever host the buyer is on (buy.questioncall.com for the app
  // hand-off). Softmato refuses any host not registered against the credential.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: object) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));

      try {
        const softmato = getSoftmato();

        send({ step: "invoice" });
        // external_ref is idempotent on Softmato's side: a retry returns the same invoice.
        const invoice = await softmato.createInvoice({
          external_ref: `qc_${txn._id}`,
          customer: { external_ref: user.id, name: user.name || user.email || "QuestionCall user", email: user.email ?? undefined },
          lines: [{ description: order.title.slice(0, 200), quantity: 1, unit_price_minor: toPaisa(order.amount) }],
          presentation: { plan_name: order.title.slice(0, 80), billing_period: order.billingPeriod },
        });
        if (txn.reference !== invoice.invoice_id) {
          txn.reference = invoice.invoice_id;
          await txn.save();
        }

        send({ step: "session" });
        const { checkout_url } = await softmato.createCheckout({
          invoice_id: invoice.invoice_id,
          return_url: `https://${host}/payment/softmato/return?ref=${txn._id}`,
        });

        send({ checkoutUrl: checkout_url });
      } catch (error) {
        // Softmato down, misconfigured, or refusing: the buyer can't pay online, so
        // the page reveals the manual eSewa fallback. Our own validation above
        // (already unlocked, bad coupon, …) never reaches here.
        console.error("[POST /api/payments/softmato/checkout]", error);
        send({ error: "Online payment is unavailable right now.", manualFallback: true });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // Per-person and live: never cached, never buffered by a proxy.
      "Cache-Control": "private, no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
