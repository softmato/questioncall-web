import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { Types } from "mongoose";

import { getSafeServerSession } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { pusherServer } from "@/lib/pusher/pusherServer";
import { ADMIN_UPDATES_CHANNEL } from "@/lib/pusher/events";
import { getPlatformConfig } from "@/models/PlatformConfig";
import Course from "@/models/Course";
import CourseEnrollment from "@/models/CourseEnrollment";
import Transaction from "@/models/Transaction";
import User from "@/models/User";
import { sendTransactionEmail } from "@/lib/sendEmails/sendTransactionEmail";
import { getMasterAdminEmails } from "@/lib/user-directory";
import { notifyUser } from "@/lib/notifications/notify-user";

cloudinary.config({
  secure: true,
});

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

async function uploadScreenshot(file: File) {
  if (
    !process.env.CLOUDINARY_URL &&
    (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET)
  ) {
    throw new Error("Server missing Cloudinary credentials.");
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  return new Promise<string>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "question_hub_course_payments",
        resource_type: "image",
      },
      (error, result) => {
        if (error || !result?.secure_url) {
          reject(error || new Error("Screenshot upload failed."));
          return;
        }

        resolve(result.secure_url);
      },
    );

    uploadStream.end(buffer);
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSafeServerSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "STUDENT") {
      return NextResponse.json(
        { error: "Only students can purchase courses." },
        { status: 403 },
      );
    }

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid course id." },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const transactionId =
      typeof formData.get("transactionId") === "string"
        ? String(formData.get("transactionId")).trim()
        : "";
    const transactorName =
      typeof formData.get("transactorName") === "string"
        ? String(formData.get("transactorName")).trim()
        : "";
    const couponCode =
      typeof formData.get("couponCode") === "string"
        ? String(formData.get("couponCode")).trim()
        : "";
    const screenshot = formData.get("screenshot");

    if (!transactionId || !transactorName) {
      return NextResponse.json(
        { error: "transactionId and transactorName are required." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const course = await Course.findById(id)
      .select("_id title instructorId pricingModel price status")
      .lean();

    const originalInstructorId = (
      course as unknown as { instructorId: { _id?: unknown } | unknown }
    ).instructorId;
    const instructorIdString =
      typeof originalInstructorId === "object" && originalInstructorId !== null
        ? String(
            (originalInstructorId as { _id?: unknown })._id ||
              originalInstructorId,
          )
        : String(originalInstructorId);

    const instructor = await User.findById(instructorIdString)
      .select("role")
      .lean();
    const isAdminCourse = instructor?.role === "ADMIN";

    if (!course || course.status !== "ACTIVE") {
      return NextResponse.json({ error: "Course not found." }, { status: 404 });
    }

    if (course.pricingModel !== "PAID" || !course.price || course.price <= 0) {
      return NextResponse.json(
        { error: "Only paid courses can be purchased through this route." },
        { status: 400 },
      );
    }

    const existingEnrollment = await CourseEnrollment.findOne({
      courseId: course._id,
      studentId: session.user.id,
    })
      .select("_id accessType")
      .lean();

    if (existingEnrollment) {
      return NextResponse.json(
        {
          error: "COURSE_ALREADY_UNLOCKED",
          accessType: existingEnrollment.accessType,
        },
        { status: 400 },
      );
    }

    const existingCompleted = await Transaction.findOne({
      transactionId,
      status: "COMPLETED",
    })
      .select("_id")
      .lean();

    if (existingCompleted) {
      return NextResponse.json(
        {
          error: "This transaction ID has already been verified and processed.",
        },
        { status: 409 },
      );
    }

    let screenshotUrl: string | undefined;
    if (screenshot instanceof File && screenshot.size > 0) {
      screenshotUrl = await uploadScreenshot(screenshot);
    }

    let grossAmount = roundCurrency(Number(course.price ?? 0));
    let appliedDiscountPercentage = 0;

    if (couponCode) {
      const { validateCourseCoupon } = await import("@/lib/course-coupons");
      const validation = await validateCourseCoupon({
        code: couponCode,
        courseId: course._id.toString(),
        studentId: session.user.id,
      });

      if (!validation.valid) {
        return NextResponse.json(
          { error: "Invalid or expired coupon." },
          { status: 400 },
        );
      }

      // Guard: prevent multiple pending transactions with the same coupon
      const existingPendingWithCoupon = await Transaction.findOne({
        userId: session.user.id,
        type: "COURSE_PURCHASE",
        status: "PENDING",
        gateway: { $ne: "SOFTMATO" },
        "metadata.couponCode": couponCode,
        "metadata.courseId": course._id.toString(),
      })
        .select("_id transactionId")
        .lean();

      if (existingPendingWithCoupon) {
        return NextResponse.json(
          {
            error:
              "You already have a pending payment using this coupon for this course. Please wait for it to be reviewed or contact support.",
          },
          { status: 409 },
        );
      }

      const CourseCouponModel = (await import("@/models/CourseCoupon")).default;
      const couponDoc = await CourseCouponModel.findById(
        validation.couponId,
      ).lean();

      // Also count pending transactions using this coupon towards the usage limit
      if (couponDoc?.usageLimit) {
        const pendingCouponUsageCount = await Transaction.countDocuments({
          type: "COURSE_PURCHASE",
          status: "PENDING",
          gateway: { $ne: "SOFTMATO" },
          "metadata.couponCode": couponCode,
        });

        const totalUsed = (couponDoc.usedCount ?? 0) + pendingCouponUsageCount;
        if (totalUsed >= couponDoc.usageLimit) {
          return NextResponse.json(
            {
              error:
                "This coupon has reached its usage limit (including pending payments).",
            },
            { status: 400 },
          );
        }
      }

      appliedDiscountPercentage = couponDoc?.discountPercentage || 0;
      grossAmount = roundCurrency(
        grossAmount * (1 - appliedDiscountPercentage / 100),
      );
    }

    const config = await getPlatformConfig();

    const commissionPercent = isAdminCourse
      ? 0
      : roundCurrency(config.coursePurchaseCommissionPercent ?? 0);
    const netAmount = roundCurrency(
      grossAmount * (1 - commissionPercent / 100),
    );

    const existingPending = await Transaction.findOne({
      transactionId,
      userId: session.user.id,
      type: "COURSE_PURCHASE",
      status: "PENDING",
    });

    if (existingPending) {
      const existingCourseId = String(
        (existingPending.metadata as Record<string, unknown> | undefined)
          ?.courseId ?? "",
      );

      if (existingCourseId && existingCourseId !== id) {
        return NextResponse.json(
          {
            error:
              "This transaction ID is already attached to another pending course purchase.",
          },
          { status: 409 },
        );
      }

      existingPending.amount = grossAmount;
      existingPending.transactorName = transactorName;
      existingPending.gateway = "MANUAL";
      existingPending.reference =
        existingPending.reference ||
        `COURSE-MANUAL-${course._id}-${session.user.id}-${Date.now()}`;
      existingPending.meta = {
        ...(existingPending.meta ?? {}),
        paymentChannel: "ESEWA_MANUAL",
      };
      existingPending.metadata = {
        courseId: course._id.toString(),
        courseName: course.title,
        instructorId: course.instructorId.toString(),
        pricingModel: course.pricingModel,
        grossAmount,
        commissionPercent,
        netAmount,
        couponCode,
        discountPercentage: appliedDiscountPercentage,
      };

      if (screenshotUrl) {
        existingPending.screenshotUrl = screenshotUrl;
      }

      await existingPending.save();

      const masterAdminEmails = await getMasterAdminEmails();
      if (masterAdminEmails.length > 0) {
        void sendTransactionEmail(
          masterAdminEmails,
          "Manual Course Purchase Updated",
          `A student has submitted an update (new screenshot/reference) for an existing pending manual payment for the course "${course.title}".${screenshotUrl ? ` Receipt: ${screenshotUrl}` : ""}`,
          existingPending.transactionId || transactionId,
          `NPR ${grossAmount}`,
          session.user.email ?? "Unknown",
        ).catch(console.error);
      }

      if (pusherServer) {
        await pusherServer
          .trigger(ADMIN_UPDATES_CHANNEL, "admin:manual-payment-submitted", {
            transactionId,
            type: "COURSE_PURCHASE",
            amount: grossAmount,
            userId: session.user.id,
          })
          .catch(console.error);
      }

      await notifyUser({
        userId: session.user.id,
        type: "PAYMENT",
        message: `Your updated payment for "${course.title}" was received and is pending review. We'll notify you once it's approved.`,
        href: "/courses/my",
      });

      return NextResponse.json(
        {
          message:
            "Course payment updated successfully. We will verify it shortly.",
          transactionId: existingPending._id.toString(),
        },
        { status: 200 },
      );
    }

    const createdTransaction = await Transaction.create({
      userId: session.user.id,
      type: "COURSE_PURCHASE",
      amount: grossAmount,
      status: "PENDING",
      transactionId,
      transactorName,
      screenshotUrl,
      gateway: "MANUAL",
      reference: `COURSE-MANUAL-${course._id}-${session.user.id}-${Date.now()}`,
      meta: {
        paymentChannel: "ESEWA_MANUAL",
      },
      metadata: {
        courseId: course._id.toString(),
        courseName: course.title,
        instructorId: instructorIdString,
        pricingModel: course.pricingModel,
        grossAmount,
        commissionPercent,
        netAmount,
        couponCode,
        discountPercentage: appliedDiscountPercentage,
      },
    });

    const masterAdminEmailsNew = await getMasterAdminEmails();
    if (masterAdminEmailsNew.length > 0) {
      void sendTransactionEmail(
        masterAdminEmailsNew,
        "New Manual Course Purchase Initiated",
        `A student has initiated a manual payment for the course "${course.title}".${screenshotUrl ? ` Receipt: ${screenshotUrl}` : ""}`,
        createdTransaction.transactionId || transactionId,
        `NPR ${grossAmount}`,
        session.user.email ?? "Unknown",
      ).catch(console.error);
    }

    if (pusherServer) {
      await pusherServer
        .trigger(ADMIN_UPDATES_CHANNEL, "admin:manual-payment-submitted", {
          transactionId,
          type: "COURSE_PURCHASE",
          amount: grossAmount,
          userId: session.user.id,
        })
        .catch(console.error);
    }

    await notifyUser({
      userId: session.user.id,
      type: "PAYMENT",
      message: `Your payment for "${course.title}" was submitted and is pending review. We'll notify you once it's approved.`,
      href: "/courses/my",
    });

    return NextResponse.json(
      {
        message:
          "Course payment submitted successfully. We will verify it shortly.",
        transactionId: createdTransaction._id.toString(),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/courses/:id/purchase/initiate]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to initiate course purchase.",
      },
      { status: 500 },
    );
  }
}
