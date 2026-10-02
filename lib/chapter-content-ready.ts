import { minutesFromSeconds, sumDurationMinutes } from "@/lib/duration";
import { connectToDatabase } from "@/lib/mongodb";
import { emitNotification } from "@/lib/pusher/pusherServer";
import Chapter from "@/models/Chapter";
import ChapterContent from "@/models/ChapterContent";
import ChapterEnrollment from "@/models/ChapterEnrollment";
import Notification from "@/models/Notification";

export type ReadyAssetInfo = {
  assetId: string;
  playbackId?: string | null;
  durationSeconds?: number | null;
};

/**
 * Chapter analogue of finalizeReadyCourseVideo. Atomically promotes a chapter
 * VIDEO content from PROCESSING → READY, rolls up the chapter duration total and
 * enrollment content totals, and notifies the instructor exactly once. Shared by
 * the status poll and the Mux webhook (passthrough `chapter:<contentId>`).
 *
 * Returns the updated content document, or null if already finalized/missing.
 */
export async function finalizeReadyChapterContent(
  contentId: string,
  asset: ReadyAssetInfo,
) {
  await connectToDatabase();

  const durationMinutes = asset.durationSeconds
    ? minutesFromSeconds(asset.durationSeconds)
    : 0;

  const updatedContent = await ChapterContent.findOneAndUpdate(
    { _id: contentId, type: "VIDEO", status: "PROCESSING" },
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

  if (!updatedContent) {
    return null;
  }

  const chapterId = updatedContent.chapterId.toString();

  const chapter = await Chapter.findById(chapterId);
  if (chapter) {
    chapter.totalDurationMinutes =
      sumDurationMinutes(chapter.totalDurationMinutes ?? 0, durationMinutes);
    await chapter.save();
  }

  await ChapterEnrollment.updateMany(
    { chapterId },
    { $inc: { totalContentCount: 1 } },
  ).catch((error) => {
    console.error("[finalizeReadyChapterContent] enrollment totals failed", error);
  });

  const instructorId = chapter?.instructorId?.toString();
  if (instructorId) {
    const notif = await Notification.create({
      userId: instructorId,
      type: "COURSE_VIDEO_READY",
      message: `Your video "${updatedContent.title}" is processed and ready to use.`,
      href: `/studio/chapter/${chapterId}`,
    }).catch((error) => {
      console.error("[finalizeReadyChapterContent] notification create failed", error);
      return null;
    });

    if (notif) {
      await emitNotification(instructorId, notif).catch((error) => {
        console.error("[finalizeReadyChapterContent] emitNotification failed", error);
      });
    }
  }

  return updatedContent;
}
