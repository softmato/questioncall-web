import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { getSafeServerSession } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import CourseCoupon from "@/models/CourseCoupon";
import CourseCouponRedemption from "@/models/CourseCouponRedemption";
import Course from "@/models/Course";
import User from "@/models/User";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSafeServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = session.user.role;
    if (role !== "ADMIN" && role !== "TEACHER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await connectToDatabase();
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const coupon = await CourseCoupon.findById(id).lean();
    if (!coupon) {
      return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
    }

    if (role === "TEACHER") {
      if (coupon.scope === "GLOBAL") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const course = await Course.findById(coupon.courseId).select("instructorId").lean();
      if (!course || course.instructorId.toString() !== session.user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Explicitly load User model so Mongoose can populate it
    await User.init();

    const redemptions = await CourseCouponRedemption.find({ couponId: id })
      .populate("studentId", "name email image")
      .populate("courseId", "title slug")
      .sort({ redeemedAt: -1 })
      .lean();

    return NextResponse.json({
      redemptions: redemptions.map((r: any) => ({
        _id: r._id.toString(),
        redeemedAt: r.redeemedAt.toISOString(),
        student: r.studentId
          ? {
              id: r.studentId._id.toString(),
              name: r.studentId.name,
              email: r.studentId.email,
              image: r.studentId.image,
            }
          : null,
        course: r.courseId
          ? {
              id: r.courseId._id.toString(),
              title: r.courseId.title,
              slug: r.courseId.slug,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("GET /api/courses/coupons/[id]/redemptions error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
