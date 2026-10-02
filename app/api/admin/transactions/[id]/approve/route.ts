import { Types } from "mongoose";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { completeCoursePurchase } from "@/lib/course-purchases";
import { completeChapterPurchase } from "@/lib/chapter-purchases";
import { connectToDatabase } from "@/lib/mongodb";
import { emitNotification, emitSubscriptionUpdated } from "@/lib/pusher/pusherServer";
import Notification from "@/models/Notification";
import { getHydratedPlans, getPlatformConfig } from "@/models/PlatformConfig";
import Transaction from "@/models/Transaction";
import User from "@/models/User";
import { sendTransactionEmail } from "@/lib/sendEmails/sendTransactionEmail";
import { generateReceiptPdf } from "@/lib/generate-receipt-pdf";
import { sendPushNotificationToUser } from "@/lib/push/web-push";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { adminNote } = (await req.json().catch(() => ({}))) as {
      adminNote?: string | null;
    };

    await connectToDatabase();

    const transaction = await Transaction.findById(id);
    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    if (transaction.status !== "PENDING") {
      return NextResponse.json(
        { error: "Only pending transactions can be approved" },
        { status: 400 },
      );
    }

    // Online (Softmato) payments settle themselves from the verified webhook;
    // a pending one is an unpaid checkout, not proof awaiting review.
    if (transaction.gateway === "SOFTMATO") {
      return NextResponse.json(
        { error: "Online payments are confirmed automatically by Softmato" },
        { status: 400 },
      );
    }

    let successPayload: Record<string, unknown> = { success: true };
    let notificationMessage = "Your payment was approved.";

    if (transaction.type === "SUBSCRIPTION_MANUAL") {
      const user = await User.findById(transaction.userId).select(
        "name subscriptionStatus subscriptionEnd trialUsed planSlug questionsAsked bonusQuestions",
      );

      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const config = await getPlatformConfig();
      const plans = getHydratedPlans(config);
      const plan = plans.find((entry) => entry.slug === transaction.planSlug);

      if (!plan) {
        return NextResponse.json(
          { error: "Transaction plan is missing or invalid" },
          { status: 400 },
        );
      }

      const now = new Date();
      const currentSubscriptionEnd =
        user.subscriptionEnd && new Date(user.subscriptionEnd) > now
          ? new Date(user.subscriptionEnd)
          : now;
      const nextSubscriptionEnd = new Date(
        currentSubscriptionEnd.getTime() +
          plan.durationDays * 24 * 60 * 60 * 1000,
      );

      // Carry forward any unused questions from the previous plan as bonus
      // instead of wiping the counter (e.g. free trial questions not yet used)
      const oldPlan = plans.find((p) => p.slug === (user.planSlug ?? "free"));
      const oldPlanMax = (oldPlan?.maxQuestions ?? 0) + (user.bonusQuestions ?? 0);
      const oldAsked = user.questionsAsked ?? 0;
      const carryOver = Math.max(0, oldPlanMax - oldAsked);

      user.subscriptionStatus = "ACTIVE";
      user.subscriptionEnd = nextSubscriptionEnd;
      user.trialUsed = true;
      user.planSlug = transaction.planSlug;
      user.questionsAsked = 0;
      user.bonusQuestions = carryOver;
      await user.save();

      await emitSubscriptionUpdated(transaction.userId.toString(), {
        subscriptionStatus: "ACTIVE",
        subscriptionEnd: nextSubscriptionEnd.toISOString(),
        planSlug: transaction.planSlug,
        questionsAsked: 0,
        bonusQuestions: carryOver,
      }).catch(console.error);

      transaction.status = "COMPLETED";
      transaction.gateway = "MANUAL";
      transaction.meta = {
        ...(transaction.meta || {}),
        adminAction: "APPROVED",
        adminApprovedAt: now.toISOString(),
        adminApprovedBy: session.user.id,
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
          adminApprovedBy: session.user.id,
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
          adminApprovedBy: session.user.id,
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
      return NextResponse.json(
        {
          error:
            "Only manual subscription, course and chapter purchase transactions can be approved",
        },
        { status: 400 },
      );
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

    // Build and attach receipt PDF (works for both subscription & course)
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
        const validUntil =
          successPayload.subscriptionEnd
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

    // Push notification to user's devices
    void sendPushNotificationToUser(transaction.userId.toString(), {
      type: "PAYMENT",
      message: notificationMessage,
      href: notificationHref,
    }).catch(console.error);

    return NextResponse.json(successPayload);
  } catch (error) {
    console.error("[POST /api/admin/transactions/[id]/approve]", error);
    return NextResponse.json(
      { error: "Failed to approve transaction" },
      { status: 500 },
    );
  }
}
