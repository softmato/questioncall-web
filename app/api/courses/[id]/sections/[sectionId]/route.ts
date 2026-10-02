import { sumDurationMinutes } from "@/lib/duration";
import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { Types } from "mongoose";

import { applyDeletedVideosToEnrollments } from "@/lib/course-progress";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/unified-auth";
import Course from "@/models/Course";
import CourseSection from "@/models/CourseSection";
import CourseVideo from "@/models/CourseVideo";
import LiveSession from "@/models/LiveSession";
import VideoProgress from "@/models/VideoProgress";

cloudinary.config({
  secure: true,
});

function clampOrder(value: number, totalItems: number) {
  return Math.max(1, Math.min(totalItems, value));
}

async function resequenceSections(courseId: string, prioritizedSectionId?: string, targetOrder?: number) {
  const sections = await CourseSection.find({ courseId }).sort({ order: 1 });

  if (sections.length === 0) {
    return;
  }

  let orderedSections = [...sections];

  if (prioritizedSectionId && targetOrder) {
    const currentIndex = orderedSections.findIndex(
      (section) => section._id.toString() === prioritizedSectionId,
    );

    if (currentIndex >= 0) {
      const [movingSection] = orderedSections.splice(currentIndex, 1);
      orderedSections.splice(
        clampOrder(targetOrder, sections.length) - 1,
        0,
        movingSection,
      );
    }
  }

  await CourseSection.bulkWrite(
    orderedSections.map((section, index) => ({
      updateOne: {
        filter: { _id: section._id },
        update: { $set: { order: index + 1 } },
      },
    })),
  );
}

async function destroyVideoAsset(publicId: string | null | undefined) {
  if (!publicId) {
    return;
  }

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: "video",
      invalidate: true,
    });
  } catch (error) {
    console.error("[Cloudinary section video cleanup]", { publicId, error });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> },
) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);

    if (!authenticatedUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (authenticatedUser.role !== "TEACHER" && authenticatedUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only teachers or admins can update sections." },
        { status: 403 },
      );
    }

    const { id, sectionId } = await params;
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(sectionId)) {
      return NextResponse.json(
        { error: "Invalid course or section id." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const [course, section] = await Promise.all([
      Course.findById(id).select("_id instructorId").lean(),
      CourseSection.findOne({ _id: sectionId, courseId: id }),
    ]);

    if (!course || !section) {
      return NextResponse.json(
        { error: "Course section not found." },
        { status: 404 },
      );
    }

    if (
      authenticatedUser.role !== "ADMIN" &&
      course.instructorId.toString() !== authenticatedUser.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const nextOrder =
      body.order === undefined ? null : Number.parseInt(String(body.order), 10);

    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (!title) {
        return NextResponse.json(
          { error: "Section title cannot be empty." },
          { status: 400 },
        );
      }
      section.title = title;
    }

    if (body.description === null) {
      section.description = null;
    } else if (typeof body.description === "string") {
      section.description = body.description.trim() || null;
    }

    await section.save();

    if (Number.isFinite(nextOrder) && nextOrder !== null && nextOrder > 0) {
      await resequenceSections(id, sectionId, nextOrder);
    }

    const updatedSection = await CourseSection.findById(sectionId);
    return NextResponse.json(updatedSection);
  } catch (error) {
    console.error("[PATCH /api/courses/:id/sections/:sectionId]", error);
    return NextResponse.json(
      { error: "Failed to update section." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> },
) {
  try {
    const authenticatedUser = await getAuthenticatedUser(_request);

    if (!authenticatedUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (authenticatedUser.role !== "TEACHER" && authenticatedUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only teachers or admins can delete sections." },
        { status: 403 },
      );
    }

    const { id, sectionId } = await params;
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(sectionId)) {
      return NextResponse.json(
        { error: "Invalid course or section id." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const [course, section, videos] = await Promise.all([
      Course.findById(id),
      CourseSection.findOne({ _id: sectionId, courseId: id }),
      CourseVideo.find({ courseId: id, sectionId }).select(
        "_id durationMinutes cloudinaryPublicId",
      ),
    ]);

    if (!course || !section) {
      return NextResponse.json(
        { error: "Course section not found." },
        { status: 404 },
      );
    }

    if (
      authenticatedUser.role !== "ADMIN" &&
      course.instructorId.toString() !== authenticatedUser.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await Promise.all(
      videos.map((video) => destroyVideoAsset(video.cloudinaryPublicId)),
    );

    const deletedVideoIds = videos.map((video) => video._id.toString());
    if (deletedVideoIds.length > 0) {
      await applyDeletedVideosToEnrollments(id, deletedVideoIds);
      await VideoProgress.deleteMany({ videoId: { $in: deletedVideoIds } });
    }

    await LiveSession.updateMany(
      { courseId: id, sectionId },
      { $set: { sectionId: null } },
    );

    const removedDuration = videos.reduce(
      (sum, video) => sumDurationMinutes(sum, video.durationMinutes ?? 0),
      0,
    );

    course.totalDurationMinutes = Math.max(
      0,
      sumDurationMinutes(course.totalDurationMinutes ?? 0, -removedDuration),
    );
    await course.save();

    await CourseVideo.deleteMany({ courseId: id, sectionId });
    await CourseSection.deleteOne({ _id: section._id });
    await resequenceSections(id);

    return NextResponse.json({
      deleted: true,
      sectionId,
      removedVideoCount: deletedVideoIds.length,
    });
  } catch (error) {
    console.error("[DELETE /api/courses/:id/sections/:sectionId]", error);
    return NextResponse.json(
      { error: "Failed to delete section." },
      { status: 500 },
    );
  }
}
