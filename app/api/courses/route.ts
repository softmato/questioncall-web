import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

import { connectToDatabase } from "@/lib/mongodb";
import { emitCourseUpdated } from "@/lib/pusher/pusherServer";
import { getAuthenticatedUser } from "@/lib/unified-auth";
import Course from "@/models/Course";
import CourseEnrollment from "@/models/CourseEnrollment";
import User from "@/models/User";
import { normalizeDurationPayload } from "@/lib/duration";

const COURSE_PRICING_MODELS = ["FREE", "SUBSCRIPTION_INCLUDED", "PAID"] as const;
const COURSE_CREATE_STATUSES = ["DRAFT", "ACTIVE"] as const;

export const dynamic = "force-dynamic";

cloudinary.config({
  secure: true,
});

type UploadedThumbnailResult = {
  secure_url: string;
  public_id: string;
};

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function parseBooleanFilter(value: string | null) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function normalizeOptionalDate(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = new Date(String(value));
  return Number.isNaN(normalized.getTime()) ? null : normalized;
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function parsePrice(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

async function uploadCourseThumbnail(file: File) {
  if (
    !process.env.CLOUDINARY_URL &&
    (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET)
  ) {
    throw new Error("Server misconfiguration: missing upload credentials");
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  return new Promise<UploadedThumbnailResult>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "question_hub_courses/thumbnails",
        resource_type: "image",
      },
      (error, result) => {
        if (error || !result?.secure_url || !result.public_id) {
          reject(error || new Error("Thumbnail upload failed"));
          return;
        }

        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
        });
      },
    );

    uploadStream.end(buffer);
  });
}

async function destroyCourseThumbnail(publicId: string | null) {
  if (!publicId) {
    return;
  }

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true,
    });
  } catch (error) {
    console.error("[POST /api/courses] thumbnail cleanup failed", {
      publicId,
      error,
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);
    const authenticatedUserId = authenticatedUser?.id ?? null;

    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const page = parsePositiveInt(searchParams.get("page"), 1, 1000);
    const limit = parsePositiveInt(searchParams.get("limit"), 20, 50);
    const pricingModel = searchParams.get("pricingModel")?.trim();
    const subject = searchParams.get("subject")?.trim();
    const level = searchParams.get("level")?.trim();
    const featured = parseBooleanFilter(searchParams.get("featured"));

    const query: Record<string, unknown> = {};

    if (authenticatedUser?.role !== "ADMIN") {
      query.status = "ACTIVE";
      // Courses merged into another one are shells — their content and students
      // moved to the target. Hide them even if the status says ACTIVE.
      query.mergedInto = null;
    }

    if (pricingModel && COURSE_PRICING_MODELS.includes(pricingModel as (typeof COURSE_PRICING_MODELS)[number])) {
      query.pricingModel = pricingModel;
    }

    if (subject) {
      query.subject = subject;
    }

    if (level) {
      query.level = level;
    }

    if (featured !== null) {
      query.isFeatured = featured;
    }

    // When instructor=me is specified, return all courses by this instructor
    // (including DRAFT, COMPLETED, ARCHIVED) — used by Course Studio
    const instructorFilter = searchParams.get("instructor")?.trim();
    if (
      instructorFilter === "me" &&
      authenticatedUser?.id &&
      (authenticatedUser.role === "TEACHER" || authenticatedUser.role === "ADMIN")
    ) {
      query.instructorId = authenticatedUser.id;
      // Remove ACTIVE-only filter so drafts show up
      delete query.status;
    }

    const [total, courses] = await Promise.all([
      Course.countDocuments(query),
      Course.find(query)
        .select(
          "_id slug title subject level pricingModel price currency status isFeatured thumbnailUrl totalDurationMinutes enrollmentCount instructorName instructorRole startDate expectedEndDate",
        )
        .sort({ isFeatured: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const progressByCourseId = new Map<string, number>();

    if (authenticatedUser?.role === "STUDENT" && authenticatedUserId && courses.length > 0) {
      const enrollments = await CourseEnrollment.find({
        studentId: authenticatedUserId,
        courseId: { $in: courses.map((course) => course._id) },
      })
        .select("courseId overallProgressPercent")
        .lean();

      enrollments.forEach((enrollment) => {
        progressByCourseId.set(
          enrollment.courseId.toString(),
          enrollment.overallProgressPercent ?? 0,
        );
      });
    }

    const responseCourses = courses.map((course) => {
      const courseId = course._id.toString();
      const overallProgressPercent = progressByCourseId.get(courseId);

      return {
        ...course,
        ...(typeof overallProgressPercent === "number"
          ? { overallProgressPercent }
          : {}),
      };
    });

    return NextResponse.json(normalizeDurationPayload({
          courses: responseCourses,
          pagination: {
            page,
            limit,
            total,
            totalPages: total > 0 ? Math.ceil(total / limit) : 0,
          },
        }));
  } catch (error) {
    console.error("[GET /api/courses]", error);
    return NextResponse.json(
      { error: "Failed to load courses." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let uploadedThumbnailPublicId: string | null = null;

  try {
    const authenticatedUser = await getAuthenticatedUser(request);

    if (!authenticatedUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (authenticatedUser.role !== "TEACHER" && authenticatedUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only teachers or admins can create courses." },
        { status: 403 },
      );
    }

    await connectToDatabase();

    const contentType = request.headers.get("content-type") || "";
    let body: Record<string, unknown>;
    let thumbnailFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      thumbnailFile = formData.get("thumbnail") instanceof File
        ? (formData.get("thumbnail") as File)
        : null;
      body = {
        tags: formData.getAll("tags"),
      };

      formData.forEach((value, key) => {
        if (key !== "thumbnail" && key !== "tags") {
          body[key] = value instanceof File ? value.name : value;
        }
      });
    } else {
      body = await request.json();
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const level = typeof body.level === "string" ? body.level.trim() : "";
    const pricingModel =
      typeof body.pricingModel === "string" ? body.pricingModel.trim() : "";
    const price = parsePrice(body.price);
    const requestedStatus =
      typeof body.status === "string" ? body.status.trim() : "DRAFT";
    const thumbnailUrlFromBody = normalizeOptionalString(body.thumbnailUrl);

    if (!title || !description) {
      return NextResponse.json(
        { error: "Title and description are required." },
        { status: 400 },
      );
    }

    const validPricingModel = (pricingModel || "FREE") as "FREE" | "SUBSCRIPTION_INCLUDED" | "PAID";
    if (!COURSE_PRICING_MODELS.includes(validPricingModel)) {
      return NextResponse.json(
        { error: "Invalid pricing model." },
        { status: 400 },
      );
    }

    if (validPricingModel === "PAID" && (!Number.isFinite(price) || price === null || price <= 0)) {
      return NextResponse.json(
        { error: "Paid courses must have a positive price." },
        { status: 400 },
      );
    }

    const normalizedStatus = COURSE_CREATE_STATUSES.includes(
      requestedStatus as (typeof COURSE_CREATE_STATUSES)[number],
    )
      ? requestedStatus
      : "DRAFT";

    const dbUser = await User.findById(authenticatedUser.id)
      .select("name role")
      .lean<{ name?: string; role?: string } | null>();

    if (!dbUser?.name || (dbUser.role !== "TEACHER" && dbUser.role !== "ADMIN")) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    let thumbnailUrl = thumbnailUrlFromBody;

    if (thumbnailFile && thumbnailFile.size > 0) {
      const uploadResult = await uploadCourseThumbnail(thumbnailFile);
      uploadedThumbnailPublicId = uploadResult.public_id;
      thumbnailUrl = uploadResult.secure_url;
    }

    const course = await Course.create({
      title,
      description,
      subject: subject || "General",
      level: level || "All Levels",
      pricingModel: validPricingModel,
      price: validPricingModel === "PAID" ? price : null,
      startDate: normalizeOptionalDate(body.startDate),
      expectedEndDate: normalizeOptionalDate(body.expectedEndDate),
      tags: normalizeTags(body.tags),
      thumbnailUrl,
      instructorId: authenticatedUser.id,
      instructorName: dbUser.name,
      instructorRole: dbUser.role,
      status: normalizedStatus,
      liveSessionsEnabled: validPricingModel === "FREE" ? false : true,
    });

    await emitCourseUpdated({
      action: "created",
      courseId: course._id.toString(),
      status: course.status,
      slug: course.slug,
    }).catch((error) => {
      console.error("[POST /api/courses] course realtime emit failed", error);
    });

    return NextResponse.json(normalizeDurationPayload(course), { status: 201 });
  } catch (error) {
    await destroyCourseThumbnail(uploadedThumbnailPublicId);
    console.error("[POST /api/courses]", error);

    if (error instanceof Error && error.name === "ValidationError") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Failed to create course." },
      { status: 500 },
    );
  }
}
