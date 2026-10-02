import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { Types } from "mongoose";

import { connectToDatabase } from "@/lib/mongodb";
import { emitCourseUpdated } from "@/lib/pusher/pusherServer";
import { getAuthenticatedUser } from "@/lib/unified-auth";
import Course from "@/models/Course";
import CourseEnrollment from "@/models/CourseEnrollment";
import CourseNotificationLog from "@/models/CourseNotificationLog";
import CourseSection from "@/models/CourseSection";
import CourseVideo from "@/models/CourseVideo";
import LiveSession from "@/models/LiveSession";
import User from "@/models/User";
import VideoProgress from "@/models/VideoProgress";
import { normalizeDurationPayload } from "@/lib/duration";

cloudinary.config({
  secure: true,
});

const COURSE_PRICING_MODELS = ["FREE", "SUBSCRIPTION_INCLUDED", "PAID"] as const;
const COURSE_STATUSES = ["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"] as const;

export const dynamic = "force-dynamic";

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

function extractCloudinaryPublicId(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);

    if (!parsedUrl.hostname.includes("cloudinary.com")) {
      return null;
    }

    const uploadIndex = parsedUrl.pathname.indexOf("/upload/");
    if (uploadIndex === -1) {
      return null;
    }

    const afterUpload = parsedUrl.pathname.slice(uploadIndex + "/upload/".length);
    const segments = afterUpload.split("/").filter(Boolean);
    const versionIndex = segments.findIndex((segment) => /^v\d+$/.test(segment));
    const publicIdSegments =
      versionIndex >= 0 ? segments.slice(versionIndex + 1) : segments;

    if (publicIdSegments.length === 0) {
      return null;
    }

    const lastSegment = publicIdSegments[publicIdSegments.length - 1] ?? "";
    publicIdSegments[publicIdSegments.length - 1] = lastSegment.replace(/\.[^.]+$/, "");

    return publicIdSegments.join("/");
  } catch {
    return null;
  }
}

async function destroyCloudinaryAsset(
  publicId: string | null | undefined,
  resourceType: "image" | "video",
) {
  if (!publicId) {
    return;
  }

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true,
    });
  } catch (error) {
    console.error(`[Cloudinary cleanup:${resourceType}]`, { publicId, error });
  }
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await getAuthenticatedUser(_request);
    const authenticatedUserId = authenticatedUser?.id ?? null;

    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid course id." }, { status: 400 });
    }

    await connectToDatabase();

    const course = await Course.findById(id).lean();

    if (!course) {
      return NextResponse.json({ error: "Course not found." }, { status: 404 });
    }

    const isAdmin = authenticatedUser?.role === "ADMIN";
    const isInstructor =
      Boolean(authenticatedUserId) &&
      course.instructorId.toString() === authenticatedUserId;

    if (!isAdmin && !isInstructor && course.status !== "ACTIVE") {
      return NextResponse.json({ error: "Course not found." }, { status: 404 });
    }

    const [sections, videos, enrollment, viewer, instructorFollowerCount] =
      await Promise.all([
        CourseSection.find({ courseId: course._id }).sort({ order: 1 }).lean(),
        CourseVideo.find({ courseId: course._id })
          .select("_id sectionId title durationMinutes order thumbnailUrl")
          .sort({ order: 1, uploadedAt: 1 })
          .lean(),
        authenticatedUser?.role === "STUDENT" && authenticatedUserId
          ? CourseEnrollment.findOne({
              courseId: course._id,
              studentId: authenticatedUserId,
            })
              .select("overallProgressPercent")
              .lean()
          : Promise.resolve(null),
        authenticatedUserId
          ? User.findById(authenticatedUserId)
              .select("favouriteCourses following")
              .lean<{ favouriteCourses?: unknown[]; following?: unknown[] }>()
          : Promise.resolve(null),
        User.countDocuments({ following: course.instructorId }),
      ]);

    const isFavourite = Boolean(
      viewer?.favouriteCourses?.some(
        (favId) => favId?.toString() === course._id.toString(),
      ),
    );
    const isFollowingInstructor = Boolean(
      viewer?.following?.some(
        (teacherId) => teacherId?.toString() === course.instructorId.toString(),
      ),
    );

    const videosBySectionId = new Map<
      string,
      Array<{
        _id: unknown;
        title: string;
        durationMinutes: number;
        order: number;
        thumbnailUrl: string | null;
      }>
    >();

    videos.forEach((video) => {
      const sectionId = video.sectionId.toString();
      const existing = videosBySectionId.get(sectionId) ?? [];
      existing.push({
        _id: video._id,
        title: video.title,
        durationMinutes: video.durationMinutes,
        order: video.order,
        thumbnailUrl: video.thumbnailUrl ?? null,
      });
      videosBySectionId.set(sectionId, existing);
    });

    const response = {
      ...course,
      sections: sections.map((section) => ({
        ...section,
        videos: videosBySectionId.get(section._id.toString()) ?? [],
      })),
      isFavourite,
      isFollowingInstructor,
      instructorFollowerCount,
      ...(authenticatedUser?.role === "STUDENT" && enrollment
        ? { overallProgressPercent: enrollment.overallProgressPercent ?? 0 }
        : {}),
    };

    return NextResponse.json(normalizeDurationPayload(response));
  } catch (error) {
    console.error("[GET /api/courses/:id]", error);
    return NextResponse.json(
      { error: "Failed to load course." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);

    if (!authenticatedUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (authenticatedUser.role !== "TEACHER" && authenticatedUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only teachers or admins can update courses." },
        { status: 403 },
      );
    }

    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid course id." }, { status: 400 });
    }

    await connectToDatabase();

    const course = await Course.findById(id);

    if (!course) {
      return NextResponse.json({ error: "Course not found." }, { status: 404 });
    }

    const isAdmin = authenticatedUser.role === "ADMIN";
    const isInstructor = course.instructorId.toString() === authenticatedUser.id;

    if (!isAdmin && !isInstructor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (!title) {
        return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
      }
      course.title = title;
    }

    if (typeof body.description === "string") {
      const description = body.description.trim();
      if (!description) {
        return NextResponse.json(
          { error: "Description cannot be empty." },
          { status: 400 },
        );
      }
      course.description = description;
    }

    if (typeof body.subject === "string") {
      const subject = body.subject.trim();
      if (!subject) {
        return NextResponse.json({ error: "Subject cannot be empty." }, { status: 400 });
      }
      course.subject = subject;
    }

    if (typeof body.level === "string") {
      const level = body.level.trim();
      if (!level) {
        return NextResponse.json({ error: "Level cannot be empty." }, { status: 400 });
      }
      course.level = level;
    }

    if (typeof body.pricingModel === "string") {
      const pricingModel = body.pricingModel.trim();

      if (!COURSE_PRICING_MODELS.includes(pricingModel as (typeof COURSE_PRICING_MODELS)[number])) {
        return NextResponse.json(
          { error: "Invalid pricing model." },
          { status: 400 },
        );
      }

      course.pricingModel = pricingModel;
    }

    if ("price" in body) {
      const price = parsePrice(body.price);

      if (price !== null && !Number.isFinite(price)) {
        return NextResponse.json({ error: "Invalid price." }, { status: 400 });
      }

      course.price = price;
    }

    if (typeof body.status === "string") {
      const status = body.status.trim();

      if (!COURSE_STATUSES.includes(status as (typeof COURSE_STATUSES)[number])) {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }

      // A merged course only exists to redirect old links — its lessons and
      // students moved to the target. Publishing it again would surface an
      // empty duplicate, and it restores nothing, so the merge is one-way.
      if (course.mergedInto && status !== "ARCHIVED") {
        return NextResponse.json(
          normalizeDurationPayload({
                      error:
                        "This course was merged into another one and cannot be published again.",
                    }),
          { status: 400 },
        );
      }

      course.status = status;
    }

    if (typeof body.isFeatured === "boolean") {
      course.isFeatured = body.isFeatured;
    }

    if ("freePreviewCount" in body) {
      const parsedPreview =
        typeof body.freePreviewCount === "number"
          ? body.freePreviewCount
          : Number(body.freePreviewCount);

      if (!Number.isInteger(parsedPreview) || parsedPreview < 0) {
        return NextResponse.json(
          { error: "Free preview count must be a non-negative whole number." },
          { status: 400 },
        );
      }

      course.freePreviewCount = parsedPreview;
    }

    if (body.thumbnailUrl === null) {
      course.thumbnailUrl = null;
    } else if (typeof body.thumbnailUrl === "string") {
      course.thumbnailUrl = body.thumbnailUrl.trim() || null;
    }

    if ("startDate" in body) {
      course.startDate = normalizeOptionalDate(body.startDate);
    }

    if ("expectedEndDate" in body) {
      course.expectedEndDate = normalizeOptionalDate(body.expectedEndDate);
    }

    if ("tags" in body) {
      course.tags = normalizeTags(body.tags);
    }

    if (typeof body.liveSessionsEnabled === "boolean") {
      course.liveSessionsEnabled = body.liveSessionsEnabled;
    }

    if (course.pricingModel === "FREE") {
      course.liveSessionsEnabled = false;
    }

    if (course.pricingModel !== "PAID") {
      course.price = null;
    }

    await course.save();

    await emitCourseUpdated({
      action: "updated",
      courseId: course._id.toString(),
      status: course.status,
      slug: course.slug,
    }).catch((error) => {
      console.error("[PATCH /api/courses/:id] course realtime emit failed", error);
    });

    return NextResponse.json(normalizeDurationPayload(course));
  } catch (error) {
    console.error("[PATCH /api/courses/:id]", error);

    if (error instanceof Error && error.name === "ValidationError") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Failed to update course." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await getAuthenticatedUser(_request);

    if (!authenticatedUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (authenticatedUser.role !== "TEACHER" && authenticatedUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only teachers or admins can delete courses." },
        { status: 403 },
      );
    }

    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid course id." }, { status: 400 });
    }

    await connectToDatabase();

    const course = await Course.findById(id);

    if (!course) {
      return NextResponse.json({ error: "Course not found." }, { status: 404 });
    }

    const isAdmin = authenticatedUser.role === "ADMIN";
    const isInstructor = course.instructorId.toString() === authenticatedUser.id;

    if (!isAdmin && !isInstructor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [videos, liveSessions] = await Promise.all([
      CourseVideo.find({ courseId: course._id })
        .select("_id cloudinaryPublicId")
        .lean(),
      LiveSession.find({ courseId: course._id })
        .select("_id recordingCloudinaryId")
        .lean(),
    ]);

    await Promise.all(
      videos.map((video) =>
        destroyCloudinaryAsset(video.cloudinaryPublicId, "video"),
      ),
    );

    await Promise.all(
      liveSessions.map((session) =>
        destroyCloudinaryAsset(session.recordingCloudinaryId, "video"),
      ),
    );

    await destroyCloudinaryAsset(
      extractCloudinaryPublicId(course.thumbnailUrl),
      "image",
    );

    await VideoProgress.deleteMany({ courseId: course._id });
    await CourseEnrollment.deleteMany({ courseId: course._id });
    await CourseNotificationLog.deleteMany({ courseId: course._id });
    await LiveSession.deleteMany({ courseId: course._id });
    await CourseVideo.deleteMany({ courseId: course._id });
    await CourseSection.deleteMany({ courseId: course._id });
    await Course.deleteOne({ _id: course._id });

    await emitCourseUpdated({
      action: "deleted",
      courseId: course._id.toString(),
      status: course.status,
      slug: course.slug,
    }).catch((error) => {
      console.error("[DELETE /api/courses/:id] course realtime emit failed", error);
    });

    return NextResponse.json(normalizeDurationPayload({
          deleted: true,
          courseId: course._id.toString(),
        }));
  } catch (error) {
    console.error("[DELETE /api/courses/:id]", error);
    return NextResponse.json(
      { error: "Failed to delete course." },
      { status: 500 },
    );
  }
}
