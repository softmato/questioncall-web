import { Types } from "mongoose";

import { completeCoursePurchase } from "@/lib/course-purchases";
import { completeChapterPurchase } from "@/lib/chapter-purchases";
import { getCoursePurchaseMetadata } from "@/lib/course-purchases";
import { connectToDatabase } from "@/lib/mongodb";
import { emitNotification } from "@/lib/pusher/pusherServer";
import { activateSubscription } from "@/lib/subscription-activation";
import { finalizePercentageCouponRedemption } from "@/lib/subscription-coupons";
import Notification from "@/models/Notification";
import { getHydratedPlans, getPlatformConfig } from "@/models/PlatformConfig";
import Transaction from "@/models/Transaction";
import User from "@/models/User";
import { sendTransactionEmail } from "@/lib/sendEmails/sendTransactionEmail";
import { generateReceiptPdf } from "@/lib/generate-receipt-pdf";
import { sendPushNotificationToUser } from "@/lib/push/web-push";

export type TransactionActionResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string; status: number };

/**
 * Approve a pending manual transaction (subscription / course / chapter) with
 * all side-effects. Mirrors `POST /api/admin/transactions/[id]/approve` so the
 * mobile admin endpoint behaves identically; reuses the same underlying helpers
 * (purchase completion, receipt PDF, email, push, pusher).
 */
export async function approveTransaction(args: {
  transactionId: string;
  adminId: string;
  adminNote?: string | null;
}): Promise<TransactionActionResult> {
  const { transactionId, adminId } = args;
  const adminNote = args.adminNote ?? null;

  await connectToDatabase();

  const transaction = Types.ObjectId.isValid(transactionId)
    ? await Transaction.findById(transactionId)
    : null;
  if (!transaction) {
    return { ok: false, error: "Transaction not found", status: 404 };
  }

  if (transaction.status !== "PENDING") {
    return {
      ok: false,
      error: "Only pending transactions can be approved",
      status: 400,
    };
  }

  let successPayload: Record<string, unknown> = { success: true };
  let notificationMessage = "Your payment was approved.";

  if (transaction.type === "SUBSCRIPTION_MANUAL") {
    if (!transaction.planSlug) {
      return {
        ok: false,
        error: "Transaction plan is missing or invalid",
        status: 400,
      };
    }

    const activation = await activateSubscription({
      userId: transaction.userId.toString(),
      planSlug: transaction.planSlug,
    });

    if (!activation.ok) {
      return { ok: false, error: activation.error, status: activation.status };
    }

    const plan = { name: activation.planName };
    const now = new Date();
    const nextSubscriptionEnd = activation.subscriptionEnd;

    const couponId = (transaction.meta as Record<string, unknown> | undefined)
      ?.subscriptionCouponId;
    if (typeof couponId === "string" && couponId) {
      const payer = await User.findById(transaction.userId).select("email").lean();
      await finalizePercentageCouponRedemption({
        couponId,
        userId: transaction.userId.toString(),
        userEmail: (payer as { email?: string } | null)?.email ?? null,
        planSlug: transaction.planSlug,
        transactionId: transaction._id,
      });
    }

    transaction.status = "COMPLETED";
    transaction.gateway = "MANUAL";
    transaction.meta = {
      ...(transaction.meta || {}),
      adminAction: "APPROVED",
      adminApprovedAt: now.toISOString(),
      adminApprovedBy: adminId,
      adminNote: adminNote?.trim() || null,
      subscriptionEndsAt: nextSubscriptionEnd.toISOString(),
    };
    await transaction.save();

    notificationMessage = `Your manual payment for ${plan.name} was approved. Access is active until ${nextSubscriptionEnd.toLocaleDateString()}.`;
    successPayload = {
      success: true,
      subscriptionEnd: nextSubscriptionEnd.toISOString(),
    };
  } else if (transaction.type === "COURSE_PURCHASE") {
    const coursePurchase = await completeCoursePurchase({
      transactionDocumentId: transaction._id.toString(),
      gateway: "MANUAL",
      metaPatch: {
        adminAction: "APPROVED",
        adminApprovedAt: new Date().toISOString(),
        adminApprovedBy: adminId,
        adminNote: adminNote?.trim() || null,
        paymentChannel:
          transaction.meta &&
          typeof transaction.meta === "object" &&
          "paymentChannel" in transaction.meta
            ? transaction.meta.paymentChannel
            : "ESEWA_MANUAL",
      },
    });

    notificationMessage = `Your manual payment for ${coursePurchase.courseName} was approved. Course access is now unlocked.`;
    successPayload = {
      success: true,
      courseId: coursePurchase.courseId,
      courseName: coursePurchase.courseName,
      enrollmentId: coursePurchase.enrollmentId,
      teacherEarnings: coursePurchase.teacherEarnings,
    };
  } else if (transaction.type === "CHAPTER_PURCHASE") {
    const chapterPurchase = await completeChapterPurchase({
      transactionDocumentId: transaction._id.toString(),
      gateway: "MANUAL",
      metaPatch: {
        adminAction: "APPROVED",
        adminApprovedAt: new Date().toISOString(),
        adminApprovedBy: adminId,
        adminNote: adminNote?.trim() || null,
        paymentChannel:
          transaction.meta &&
          typeof transaction.meta === "object" &&
          "paymentChannel" in transaction.meta
            ? transaction.meta.paymentChannel
            : "ESEWA_MANUAL",
      },
    });

    notificationMessage = `Your manual payment for ${chapterPurchase.chapterName} was approved. Chapter access is now unlocked.`;
    successPayload = {
      success: true,
      chapterId: chapterPurchase.chapterId,
      chapterName: chapterPurchase.chapterName,
      enrollmentId: chapterPurchase.enrollmentId,
      teacherEarnings: chapterPurchase.teacherEarnings,
    };
  } else {
    return {
      ok: false,
      error:
        "Only manual subscription, course and chapter purchase transactions can be approved",
      status: 400,
    };
  }

  const notificationHref =
    transaction.type === "COURSE_PURCHASE"
      ? "/courses/my"
      : transaction.type === "CHAPTER_PURCHASE"
        ? "/chapters/my"
        : "/subscription";

  const notification = await Notification.create({
    userId: transaction.userId,
    type: "PAYMENT",
    message: notificationMessage,
    href: notificationHref,
    isRead: false,
  }).catch(() => null);

  if (notification) {
    await emitNotification(transaction.userId.toString(), notification).catch(() => {});
  }

  const recipientUser = await User.findById(transaction.userId).select("email name");

  let receiptPdf: Buffer | null = null;
  if (recipientUser?.email) {
    const issuedAt = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const commonReceipt = {
      transactionId: transaction.transactionId ?? transaction._id.toString(),
      amount: `NPR ${transaction.amount}`,
      paymentMethod: "Manual (eSewa)",
      issuedTo: recipientUser.email,
      issuedAt,
      note: (transaction.meta as any)?.adminNote || null,
    };

    if (transaction.type === "SUBSCRIPTION_MANUAL") {
      const validUntil = successPayload.subscriptionEnd
        ? new Date(successPayload.subscriptionEnd as string).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : null;
      receiptPdf = await generateReceiptPdf({
        ...commonReceipt,
        itemLabel: "Plan",
        itemName: transaction.planSlug?.toUpperCase() ?? "PLAN",
        validUntil,
      }).catch(() => null);
    } else if (transaction.type === "COURSE_PURCHASE") {
      const courseName =
        (successPayload as any).courseName ||
        (transaction.metadata as any)?.courseName ||
        "Course";
      receiptPdf = await generateReceiptPdf({
        ...commonReceipt,
        itemLabel: "Course",
        itemName: courseName,
        validUntil: null,
      }).catch(() => null);
    } else if (transaction.type === "CHAPTER_PURCHASE") {
      const chapterName =
        (successPayload as any).chapterName ||
        (transaction.metadata as any)?.chapterName ||
        "Chapter";
      receiptPdf = await generateReceiptPdf({
        ...commonReceipt,
        itemLabel: "Chapter",
        itemName: chapterName,
        validUntil: null,
      }).catch(() => null);
    }
  }

  if (recipientUser?.email) {
    void sendTransactionEmail(
      recipientUser.email,
      "Transaction Approved",
      notificationMessage,
      transaction.transactionId,
      `NPR ${transaction.amount}`,
      recipientUser.email,
      receiptPdf,
    ).catch(console.error);
  }

  void sendPushNotificationToUser(transaction.userId.toString(), {
    type: "PAYMENT",
    message: notificationMessage,
    href: notificationHref,
  }).catch(console.error);

  return { ok: true, payload: successPayload };
}

/**
 * Reject/refund a pending manual transaction. Mirrors
 * `POST /api/admin/transactions/[id]/refund`.
 */
export async function refundTransaction(args: {
  transactionId: string;
  adminId: string;
  adminNote?: string | null;
}): Promise<TransactionActionResult> {
  const { transactionId, adminId } = args;
  const adminNote = args.adminNote ?? null;

  await connectToDatabase();

  const transaction = Types.ObjectId.isValid(transactionId)
    ? await Transaction.findById(transactionId)
    : null;
  if (!transaction) {
    return { ok: false, error: "Transaction not found", status: 404 };
  }

  if (transaction.status !== "PENDING") {
    return {
      ok: false,
      error: "Only pending transactions can be refunded",
      status: 400,
    };
  }

  if (
    transaction.type !== "SUBSCRIPTION_MANUAL" &&
    transaction.type !== "COURSE_PURCHASE"
  ) {
    return {
      ok: false,
      error:
        "Only manual subscription and manual course purchase transactions can be refunded",
      status: 400,
    };
  }

  transaction.status = "FAILED";
  transaction.gateway = "MANUAL";
  transaction.meta = {
    ...(transaction.meta || {}),
    adminAction: "REFUNDED",
    refundedAt: new Date().toISOString(),
    refundedBy: adminId,
    adminNote: adminNote?.trim() || null,
  };
  await transaction.save();

  let notificationMessage = "Your payment was not approved.";

  if (transaction.type === "SUBSCRIPTION_MANUAL") {
    const config = await getPlatformConfig();
    const plans = getHydratedPlans(config);
    const plan = plans.find((entry) => entry.slug === transaction.planSlug);
    const planName = plan?.name || "your subscription";
    notificationMessage = `Your manual payment for ${planName} was not approved${adminNote?.trim() ? `: ${adminNote.trim()}` : "."}`;
  } else if (transaction.type === "COURSE_PURCHASE") {
    const metadata = getCoursePurchaseMetadata(
      (transaction.metadata ?? {}) as Record<string, unknown>,
    );
    const courseName = metadata.courseName || "your course purchase";
    notificationMessage = `Your manual payment for ${courseName} was not approved${adminNote?.trim() ? `: ${adminNote.trim()}` : "."}`;
  }

  const notification = await Notification.create({
    userId: transaction.userId,
    type: "PAYMENT",
    message: notificationMessage,
    href: "/subscription",
    isRead: false,
  }).catch(() => null);

  if (notification) {
    await emitNotification(transaction.userId.toString(), notification).catch(() => {});
  }

  return { ok: true, payload: { success: true } };
}
