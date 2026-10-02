import { sumDurationMinutes } from "@/lib/duration";
import { NextRequest, NextResponse } from "next/server";

import { Types } from "mongoose";

import { checkCourseAccess, getCourseFreePreviewVideoIds } from "@/lib/course-access";
import { getAuthenticatedUser } from "@/lib/unified-auth";
import {
  applyDeletedVideosToEnrollments,
} from "@/lib/course-progress";
import { connectToDatabase } from "@/lib/mongodb";
import Course from "@/models/Course";
import CourseSection from "@/models/CourseSection";
import CourseVideo from "@/models/CourseVideo";
import LiveSession from "@/models/LiveSession";
import VideoProgress from "@/models/VideoProgress";

import Mux from "@mux/mux-node";
import { normalizeDurationPayload } from "@/lib/duration";

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID || "demo",
  tokenSecret: process.env.MUX_TOKEN_SECRET || "demo",
});

function clampOrder(value: number, totalItems: number) {
  return Math.max(1, Math.min(totalItems, value));
}

async function destroyVideoAsset(muxAssetId: string | null | undefined) {
  if (!muxAssetId) {
    return;
  }

  try {
    await mux.video.assets.delete(muxAssetId);
  } catch (error) {
    console.error("[Mux video cleanup]", { muxAssetId, error });
  }
}

async function resequenceVideos(sectionId: string) {
  const videos = await CourseVideo.find({ sectionId }).sort({ order: 1 });

  if (videos.length === 0) {
    return;
  }

  await CourseVideo.bulkWrite(
    videos.map((video, index) => ({
      updateOne: {
        filter: { _id: video._id },
        update: { $set: { order: index + 1 } },
      },
    })),
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; videoId: string }> },
) {
  try {
    const authenticatedUser = await getAuthenticatedUser(_request);

    if (!authenticatedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, videoId } = await params;
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(videoId)) {
      return NextResponse.json(
        { error: "Invalid course or video id." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const video = await CourseVideo.findOne({ _id: videoId, courseId: id });
    if (!video) {
      return NextResponse.json({ error: "Video not found." }, { status: 404 });
    }

    const canAccess = await checkCourseAccess(authenticatedUser.id, id);
    // Non-enrolled users can still watch the course's free-preview videos.
    let isPreview = false;
    if (!canAccess) {
      const previewIds = await getCourseFreePreviewVideoIds(id);
      isPreview = previewIds.has(videoId);
      if (!isPreview) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    void CourseVideo.findByIdAndUpdate(video._id, { $inc: { viewCount: 1 } }).catch(
      (error) => console.error("[CourseVideo viewCount increment]", error),
    );

    const plain = video.toObject ? video.toObject() : { ...video };
    const playbackUrl = video.muxPlaybackId
      ? `https://stream.mux.com/${video.muxPlaybackId}.m3u8`
      : video.videoUrl ?? null;

    return NextResponse.json(normalizeDurationPayload({ ...plain, playbackUrl, isPreview }));
  } catch (error) {
    console.error("[GET /api/courses/:id/videos/:videoId]", error);
    return NextResponse.json(
      { error: "Failed to load course video." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; videoId: string }> },
) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);

    if (!authenticatedUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (authenticatedUser.role !== "TEACHER" && authenticatedUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only teachers or admins can update videos." },
        { status: 403 },
      );
    }

    const { id, videoId } = await params;
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(videoId)) {
      return NextResponse.json(
        { error: "Invalid course or video id." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const [course, video] = await Promise.all([
      Course.findById(id),
      CourseVideo.findOne({ _id: videoId, courseId: id }),
    ]);

    if (!course || !video) {
      return NextResponse.json({ error: "Video not found." }, { status: 404 });
    }

    if (
      authenticatedUser.role !== "ADMIN" &&
      course.instructorId.toString() !== authenticatedUser.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const currentSectionId = video.sectionId.toString();
    const requestedSectionId =
      typeof body.sectionId === "string" ? body.sectionId : currentSectionId;
    const parsedOrder =
      body.order === undefined ? null : Number.parseInt(String(body.order), 10);

    if (!Types.ObjectId.isValid(requestedSectionId)) {
      return NextResponse.json({ error: "Invalid section id." }, { status: 400 });
    }

    const targetSection = await CourseSection.findOne({
      _id: requestedSectionId,
      courseId: id,
    });

    if (!targetSection) {
      return NextResponse.json({ error: "Section not found." }, { status: 404 });
    }

    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (!title) {
        return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
      }
      video.title = title;
    }

    if (body.description === null) {
      video.description = null;
    } else if (typeof body.description === "string") {
      video.description = body.description.trim() || null;
    }

    if (requestedSectionId !== currentSectionId) {
      const oldSection = await CourseSection.findById(currentSectionId);
      if (!oldSection) {
        return NextResponse.json({ error: "Current section not found." }, { status: 404 });
      }

      const [oldSectionVideos, targetSectionVideos] = await Promise.all([
        CourseVideo.find({
          sectionId: currentSectionId,
          _id: { $ne: video._id },
        }).sort({ order: 1 }),
        CourseVideo.find({
          sectionId: requestedSectionId,
          _id: { $ne: video._id },
        }).sort({ order: 1 }),
      ]);

      const insertionOrder = clampOrder(
        parsedOrder ?? targetSectionVideos.length + 1,
        targetSectionVideos.length + 1,
      );

      await CourseVideo.bulkWrite([
        ...oldSectionVideos.map((sectionVideo, index) => ({
          updateOne: {
            filter: { _id: sectionVideo._id },
            update: { $set: { order: index + 1 } },
          },
        })),
        ...[
          ...targetSectionVideos.slice(0, insertionOrder - 1),
          video,
          ...targetSectionVideos.slice(insertionOrder - 1),
        ].map((sectionVideo, index) => ({
          updateOne: {
            filter: { _id: sectionVideo._id },
            update: {
              $set: {
                sectionId: sectionVideo._id.toString() === video._id.toString()
                  ? requestedSectionId
                  : sectionVideo.sectionId,
                order: index + 1,
              },
            },
          },
        })),
      ]);

      oldSection.totalVideos = Math.max(0, (oldSection.totalVideos ?? 1) - 1);
      oldSection.totalDurationMinutes = Math.max(
        0,
        sumDurationMinutes(oldSection.totalDurationMinutes ?? 0, -(video.durationMinutes ?? 0)),
      );
      await oldSection.save();

      targetSection.totalVideos = (targetSection.totalVideos ?? 0) + 1;
      targetSection.totalDurationMinutes =
        sumDurationMinutes(targetSection.totalDurationMinutes ?? 0, (video.durationMinutes ?? 0));
      await targetSection.save();

      video.sectionId = targetSection._id;
      video.order = insertionOrder;
    } else if (Number.isFinite(parsedOrder) && parsedOrder !== null && parsedOrder > 0) {
      const siblingVideos = await CourseVideo.find({
        sectionId: currentSectionId,
      }).sort({ order: 1 });

      const otherVideos = siblingVideos.filter(
        (sectionVideo) => sectionVideo._id.toString() !== video._id.toString(),
      );
      const targetOrder = clampOrder(parsedOrder, siblingVideos.length);
      const reordered = [...otherVideos];
      reordered.splice(targetOrder - 1, 0, video);

      await CourseVideo.bulkWrite(
        reordered.map((sectionVideo, index) => ({
          updateOne: {
            filter: { _id: sectionVideo._id },
            update: { $set: { order: index + 1 } },
          },
        })),
      );

      video.order = targetOrder;
    }

    await video.save();

    const updatedVideo = await CourseVideo.findById(video._id);
    return NextResponse.json(normalizeDurationPayload(updatedVideo));
  } catch (error) {
    console.error("[PATCH /api/courses/:id/videos/:videoId]", error);
    return NextResponse.json(
      { error: "Failed to update course video." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; videoId: string }> },
) {
  try {
    const authenticatedUser = await getAuthenticatedUser(_request);

    if (!authenticatedUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (authenticatedUser.role !== "TEACHER" && authenticatedUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only teachers or admins can delete videos." },
        { status: 403 },
      );
    }

    const { id, videoId } = await params;
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(videoId)) {
      return NextResponse.json(
        { error: "Invalid course or video id." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const [course, video] = await Promise.all([
      Course.findById(id),
      CourseVideo.findOne({ _id: videoId, courseId: id }),
    ]);

    if (!course || !video) {
      return NextResponse.json({ error: "Video not found." }, { status: 404 });
    }

    if (
      authenticatedUser.role !== "ADMIN" &&
      course.instructorId.toString() !== authenticatedUser.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const section = await CourseSection.findById(video.sectionId);
    if (!section) {
      return NextResponse.json({ error: "Section not found." }, { status: 404 });
    }

    await destroyVideoAsset(video.muxAssetId);
    await VideoProgress.deleteMany({ videoId: video._id });
    await applyDeletedVideosToEnrollments(id, [video._id.toString()]);

    section.totalVideos = Math.max(0, (section.totalVideos ?? 1) - 1);
    section.totalDurationMinutes = Math.max(
      0,
      sumDurationMinutes(section.totalDurationMinutes ?? 0, -(video.durationMinutes ?? 0)),
    );
    await section.save();

    course.totalDurationMinutes = Math.max(
      0,
      sumDurationMinutes(course.totalDurationMinutes ?? 0, -(video.durationMinutes ?? 0)),
    );
    await course.save();

    await LiveSession.updateMany(
      { courseVideoId: video._id },
      { $set: { courseVideoId: null } },
    );
    await CourseVideo.deleteOne({ _id: video._id });
    await resequenceVideos(section._id.toString());

    return NextResponse.json(normalizeDurationPayload({ deleted: true, videoId }));
  } catch (error) {
    console.error("[DELETE /api/courses/:id/videos/:videoId]", error);
    return NextResponse.json(
      { error: "Failed to delete course video." },
      { status: 500 },
    );
  }
}
