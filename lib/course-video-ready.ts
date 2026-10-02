import { minutesFromSeconds, sumDurationMinutes } from "@/lib/duration";
import { connectToDatabase } from "@/lib/mongodb";
import { incrementEnrollmentVideoTotals } from "@/lib/course-progress";
import { emitNotification } from "@/lib/pusher/pusherServer";
import Course from "@/models/Course";
import CourseSection from "@/models/CourseSection";
import CourseVideo from "@/models/CourseVideo";
import Notification from "@/models/Notification";

export type ReadyAssetInfo = {
  assetId: string;
  playbackId?: string | null;
  durationSeconds?: number | null;
};

/**
 * Atomically promote a course video from PROCESSING → READY, roll up the
 * section / course / enrollment duration totals, and notify the instructor.
 *
 * This is the single source of truth shared by:
 *   - the on-demand status poll (GET …/videos/:id/status), and
 *   - the Mux webhook (POST /api/webhooks/mux).
 *
 * The `findOneAndUpdate({ status: "PROCESSING" })` guard means only the FIRST
 * caller to observe readiness wins the transition; any later caller (the other
 * path racing on the same asset) gets `null` back and performs no side effects.
 * That keeps the totals and the "video ready" notification exactly-once.
 *
 * Returns the updated video document, or `null` if it was already finalized
 * (or no longer exists).
 */
export async function finalizeReadyCourseVideo(
  videoId: string,
  asset: ReadyAssetInfo,
) {
  await connectToDatabase();

  const durationMinutes = asset.durationSeconds
    ? minutesFromSeconds(asset.durationSeconds)
    : 0;

  const updatedVideo = await CourseVideo.findOneAndUpdate(
    { _id: videoId, status: "PROCESSING" },
    {
      $set: {
        status: "READY",
        muxAssetId: asset.assetId,
        ...(asset.playbackId ? { muxPlaybackId: asset.playbackId } : {}),
        durationMinutes,
      },
    },
    { new: true },
  );

  // Lost the race (already READY) or the record is gone — nothing to do.
  if (!updatedVideo) {
    return null;
  }

  const courseId = updatedVideo.courseId.toString();

  const section = await CourseSection.findById(updatedVideo.sectionId);
  if (section) {
    section.totalVideos = (section.totalVideos ?? 0) + 1;
    section.totalDurationMinutes =
      sumDurationMinutes(section.totalDurationMinutes ?? 0, durationMinutes);
    await section.save();
  }

  const course = await Course.findById(courseId);
  if (course) {
    course.totalDurationMinutes =
      sumDurationMinutes(course.totalDurationMinutes ?? 0, durationMinutes);
    await course.save();
  }

  await incrementEnrollmentVideoTotals(courseId, 1);

  // Notify the instructor: persistent record + realtime + push. Best-effort —
  // a notification failure must never undo the (already committed) READY flip.
  const instructorId = course?.instructorId?.toString();
  if (instructorId) {
    const notif = await Notification.create({
      userId: instructorId,
      type: "COURSE_VIDEO_READY",
      message: `Your video "${updatedVideo.title}" is processed and ready to use.`,
      href: `/studio/${courseId}`,
    }).catch((error) => {
      console.error("[finalizeReadyCourseVideo] notification create failed", error);
      return null;
    });

    if (notif) {
      await emitNotification(instructorId, notif).catch((error) => {
        console.error("[finalizeReadyCourseVideo] emitNotification failed", error);
      });
    }
  }

  return updatedVideo;
}
