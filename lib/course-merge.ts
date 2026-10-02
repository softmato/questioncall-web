import { minutesFromSeconds } from "@/lib/duration";
import { Types } from "mongoose";

import { connectToDatabase } from "@/lib/mongodb";
import { calculateOverallProgressPercent } from "@/lib/course-progress";
import Course from "@/models/Course";
import CourseCoupon from "@/models/CourseCoupon";
import CourseEnrollment from "@/models/CourseEnrollment";
import CourseMergeLog from "@/models/CourseMergeLog";
import CourseNotificationLog from "@/models/CourseNotificationLog";
import CourseSection from "@/models/CourseSection";
import CourseVideo from "@/models/CourseVideo";
import LiveSession from "@/models/LiveSession";
import VideoProgress from "@/models/VideoProgress";

/**
 * If `slug` belongs to a course that was merged away, return the slug of the
 * course it was merged into (following chains defensively, max 5 hops).
 * Used by course pages to redirect old links instead of 404ing.
 */
export async function getMergedRedirectSlug(slug: string): Promise<string | null> {
  await connectToDatabase();

  const origin = await Course.findOne({ slug })
    .select("mergedInto")
    .lean<{ mergedInto?: Types.ObjectId | null } | null>();

  if (!origin?.mergedInto) return null;

  let cursor: Types.ObjectId | null | undefined = origin.mergedInto;
  for (let hop = 0; hop < 5 && cursor; hop += 1) {
    const next: { slug?: string; mergedInto?: Types.ObjectId | null } | null =
      await Course.findById(cursor).select("slug mergedInto").lean();
    if (!next) return null;
    if (!next.mergedInto) return next.slug ?? null;
    cursor = next.mergedInto;
  }

  return null;
}

export type MergeCoursesInput = {
  /**
   * Merge into an EXISTING course. Mutually exclusive with `newCourseTitle`.
   */
  targetCourseId?: string | null;
  /**
   * Merge into a NEW course created with this title — the primary flow: the
   * admin picks the duplicate courses, names the consolidated course, and every
   * selected course's content and students land in it. Course settings
   * (description, pricing, subject, level, thumbnail) are inherited from the
   * first selected course; the sources are then archived.
   */
  newCourseTitle?: string | null;
  sourceCourseIds: string[];
  adminId: string;
  dryRun: boolean;
  /**
   * When a source course has exactly one section, retitle that section to the
   * source course's title — the "each duplicate course was really one chapter
   * of the same course" case this feature exists for.
   */
  wrapSourcesAsSections: boolean;
};

export type MergeCoursesResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string; status: number };

type SourceImpact = {
  courseId: string;
  title: string;
  sections: number;
  videos: number;
  enrollments: number;
  enrollmentCollisions: number;
  videoProgressRows: number;
  activeCoupons: number;
  liveSessions: number;
};

/**
 * Merge an instructor's duplicate courses into one target course.
 *
 * Idempotent by construction: every step filters on the SOURCE course id, and
 * those filters empty out as steps complete — a merge interrupted midway can
 * be safely re-run with the same payload. (Atlas multi-doc transactions are
 * not used because the rest of this codebase runs on the plain connection
 * helper; idempotence is the recovery story instead.)
 */
export async function mergeCoursesIntoTarget(
  input: MergeCoursesInput,
): Promise<MergeCoursesResult> {
  const { sourceCourseIds, adminId, dryRun, wrapSourcesAsSections } = input;
  const targetCourseId = input.targetCourseId?.trim() || null;
  const newCourseTitle = input.newCourseTitle?.trim() || null;

  if (!targetCourseId && !newCourseTitle) {
    return {
      ok: false,
      error: "Provide a name for the merged course.",
      status: 400,
    };
  }

  if (targetCourseId && newCourseTitle) {
    return {
      ok: false,
      error: "Choose either an existing target course or a new course name, not both.",
      status: 400,
    };
  }

  if (targetCourseId && !Types.ObjectId.isValid(targetCourseId)) {
    return { ok: false, error: "Invalid target course id.", status: 400 };
  }

  if (newCourseTitle && newCourseTitle.length > 200) {
    return {
      ok: false,
      error: "The merged course name must be 200 characters or fewer.",
      status: 400,
    };
  }

  // Preserve the admin's selection order — the first course is the template the
  // new merged course inherits its settings from.
  const uniqueSourceIds = [...new Set(sourceCourseIds)];

  const minimumSources = newCourseTitle ? 2 : 1;
  if (uniqueSourceIds.length < minimumSources) {
    return {
      ok: false,
      error: newCourseTitle
        ? "Select at least two courses to merge together."
        : "Select at least one source course.",
      status: 400,
    };
  }

  if (uniqueSourceIds.some((id) => !Types.ObjectId.isValid(id))) {
    return { ok: false, error: "Invalid source course id.", status: 400 };
  }

  if (targetCourseId && uniqueSourceIds.includes(targetCourseId)) {
    return {
      ok: false,
      error: "The target course cannot also be a source.",
      status: 400,
    };
  }

  await connectToDatabase();

  const foundSources = await Course.find({ _id: { $in: uniqueSourceIds } });

  if (foundSources.length !== uniqueSourceIds.length) {
    return { ok: false, error: "One or more source courses were not found.", status: 404 };
  }

  // Restore selection order (Mongo returns them in natural/index order).
  const sourcesById = new Map(
    foundSources.map((source) => [source._id.toString(), source]),
  );
  const sources = uniqueSourceIds.map((id) => sourcesById.get(id)!);

  const alreadyMerged = sources.find((source) => source.mergedInto);
  if (alreadyMerged) {
    return {
      ok: false,
      error: `"${alreadyMerged.title}" was already merged into another course.`,
      status: 400,
    };
  }

  // All sources must share one instructor — this consolidates a single
  // teacher's duplicates, it does not move content between teachers.
  const template = sources[0];
  const instructorId = template.instructorId?.toString();
  const crossInstructor = sources.find(
    (source) => source.instructorId?.toString() !== instructorId,
  );
  if (crossInstructor) {
    return {
      ok: false,
      error: `"${crossInstructor.title}" belongs to a different instructor than "${template.title}".`,
      status: 400,
    };
  }

  let target: typeof template | null = null;

  if (targetCourseId) {
    target = await Course.findById(targetCourseId);

    if (!target) {
      return { ok: false, error: "Target course not found.", status: 404 };
    }

    if (target.instructorId?.toString() !== instructorId) {
      return {
        ok: false,
        error: "The target course belongs to a different instructor than the sources.",
        status: 400,
      };
    }

    if (target.mergedInto) {
      return {
        ok: false,
        error: "The target course was itself merged into another course.",
        status: 400,
      };
    }
  }

  // ── Impact report (dry-run AND the executed summary) ────────────────────
  // Students already counted toward the destination. Seeded from an existing
  // target, then grown as each source is folded in, so a student enrolled in
  // two of the selected courses is reported as one transfer + one collision
  // rather than two transfers.
  const destinationStudentIds = new Set(
    target
      ? (
          await CourseEnrollment.find({ courseId: target._id }).select("studentId").lean()
        ).map((enrollment) => enrollment.studentId.toString())
      : [],
  );

  const impacts: SourceImpact[] = [];
  for (const source of sources) {
    const [sections, videos, enrollments, progressRows, activeCoupons, liveSessions] =
      await Promise.all([
        CourseSection.countDocuments({ courseId: source._id }),
        CourseVideo.countDocuments({ courseId: source._id }),
        CourseEnrollment.find({ courseId: source._id }).select("studentId").lean(),
        VideoProgress.countDocuments({ courseId: source._id }),
        CourseCoupon.countDocuments({
          scope: "COURSE",
          courseId: source._id,
          isActive: true,
        }),
        LiveSession.countDocuments({ courseId: source._id }),
      ]);

    let collisions = 0;
    for (const enrollment of enrollments) {
      const studentKey = enrollment.studentId.toString();
      if (destinationStudentIds.has(studentKey)) {
        collisions += 1;
      } else {
        destinationStudentIds.add(studentKey);
      }
    }

    impacts.push({
      courseId: source._id.toString(),
      title: source.title,
      sections,
      videos,
      enrollments: enrollments.length,
      enrollmentCollisions: collisions,
      videoProgressRows: progressRows,
      activeCoupons,
      liveSessions,
    });
  }

  if (dryRun) {
    const uniqueStudents = destinationStudentIds.size;
    return {
      ok: true,
      payload: {
        dryRun: true,
        target: target
          ? { courseId: target._id.toString(), title: target.title, isNew: false }
          : { courseId: null, title: newCourseTitle, isNew: true },
        sources: impacts,
        // What the destination ends up with once every source is folded in.
        projectedStudentCount: uniqueStudents,
        projectedVideoCount: impacts.reduce((sum, item) => sum + item.videos, 0),
      },
    };
  }

  // Create the destination course now that validation passed. Settings are
  // inherited from the first selected course so pricing/access stay consistent
  // with what those students already bought into.
  if (!target) {
    target = await Course.create({
      title: newCourseTitle,
      description: template.description,
      subject: template.subject,
      level: template.level,
      pricingModel: template.pricingModel,
      price: template.price,
      currency: template.currency,
      freePreviewCount: template.freePreviewCount ?? 0,
      // Visible if any of the merged courses was live; otherwise stays a draft.
      status: sources.some((source) => source.status === "ACTIVE") ? "ACTIVE" : "DRAFT",
      isFeatured: sources.some((source) => source.isFeatured),
      thumbnailUrl: template.thumbnailUrl,
      instructorId: template.instructorId,
      instructorName: template.instructorName,
      instructorRole: template.instructorRole,
      liveSessionsEnabled: sources.some((source) => source.liveSessionsEnabled),
      startDate: template.startDate,
      expectedEndDate: template.expectedEndDate,
      tags: [...new Set(sources.flatMap((source) => source.tags ?? []))],
    });
  }

  // Re-seed from the real destination: the projection above consumed the set.
  const targetEnrollmentStudentIds = new Set(
    (
      await CourseEnrollment.find({ courseId: target._id }).select("studentId").lean()
    ).map((enrollment) => enrollment.studentId.toString()),
  );

  // ── Execute ─────────────────────────────────────────────────────────────
  let deactivatedCoupons = 0;

  for (const source of sources) {
    // 1. Sections: re-parent with order offset past the target's current max.
    const maxOrderDoc = await CourseSection.findOne({ courseId: target._id })
      .sort({ order: -1 })
      .select("order")
      .lean();
    const orderOffset = maxOrderDoc?.order ?? 0;

    const sourceSections = await CourseSection.find({ courseId: source._id }).sort({
      order: 1,
    });

    for (const [index, section] of sourceSections.entries()) {
      section.courseId = target._id;
      section.order = orderOffset + index + 1;
      if (wrapSourcesAsSections && sourceSections.length === 1) {
        section.title = source.title;
      }
      await section.save();
    }

    // 2. Videos follow their sections; only the courseId changes.
    await CourseVideo.updateMany({ courseId: source._id }, { courseId: target._id });

    // 3. Enrollments: migrate, deduping students already enrolled in the target.
    const sourceEnrollments = await CourseEnrollment.find({ courseId: source._id });
    for (const enrollment of sourceEnrollments) {
      const studentKey = enrollment.studentId.toString();
      if (targetEnrollmentStudentIds.has(studentKey)) {
        // Student already has a target enrollment — keep it, fold the source
        // one in. Their progress rows must point at the surviving enrollment.
        const targetEnrollment = await CourseEnrollment.findOne({
          courseId: target._id,
          studentId: enrollment.studentId,
        }).select("_id enrolledAt");
        if (targetEnrollment) {
          await VideoProgress.updateMany(
            { enrollmentId: enrollment._id },
            { enrollmentId: targetEnrollment._id },
          );
          if (
            enrollment.enrolledAt &&
            targetEnrollment.enrolledAt &&
            enrollment.enrolledAt < targetEnrollment.enrolledAt
          ) {
            await CourseEnrollment.updateOne(
              { _id: targetEnrollment._id },
              { enrolledAt: enrollment.enrolledAt },
            );
          }
        }
        await CourseEnrollment.deleteOne({ _id: enrollment._id });
      } else {
        enrollment.courseId = target._id;
        await enrollment.save();
        targetEnrollmentStudentIds.add(studentKey);
      }
    }

    // 4. Watch state: video ids are unchanged, so progress survives intact.
    await VideoProgress.updateMany({ courseId: source._id }, { courseId: target._id });

    // 5. Course-scoped coupons on the source no longer sell anything —
    //    deactivate (reported back so the admin can recreate on the target).
    const couponResult = await CourseCoupon.updateMany(
      { scope: "COURSE", courseId: source._id, isActive: true },
      { isActive: false },
    );
    deactivatedCoupons += couponResult.modifiedCount ?? 0;

    // 6. Related docs follow the content.
    await LiveSession.updateMany({ courseId: source._id }, { courseId: target._id });
    await CourseNotificationLog.updateMany(
      { courseId: source._id },
      { courseId: target._id },
    );

    // 7. Archive the source; old links redirect via mergedInto.
    source.status = "ARCHIVED";
    source.mergedInto = target._id;
    await source.save();
  }

  // ── Recompute target aggregates ─────────────────────────────────────────
  const [readyVideoStats, enrollmentCount] = await Promise.all([
    CourseVideo.aggregate<{ _id: null; count: number; durationMinutes: number }>([
      { $match: { courseId: target._id, status: "READY" } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          durationMinutes: { $sum: { $round: [{ $multiply: [{ $ifNull: ["$durationMinutes", 0] }, 60] }, 0] } },
        },
      },
    ]),
    CourseEnrollment.countDocuments({ courseId: target._id }),
  ]);

  const totalVideoCount = readyVideoStats[0]?.count ?? 0;
  const totalDurationMinutes = minutesFromSeconds(readyVideoStats[0]?.durationMinutes ?? 0);

  target.totalDurationMinutes = totalDurationMinutes;
  target.enrollmentCount = enrollmentCount;
  await target.save();

  // Per-section totals (videos moved between courses, not sections, but source
  // sections may have stale aggregates from before the merge — refresh all).
  const targetSections = await CourseSection.find({ courseId: target._id }).select("_id");
  for (const section of targetSections) {
    const stats = await CourseVideo.aggregate<{
      _id: null;
      count: number;
      durationMinutes: number;
    }>([
      { $match: { sectionId: section._id, status: "READY" } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          durationMinutes: { $sum: { $round: [{ $multiply: [{ $ifNull: ["$durationMinutes", 0] }, 60] }, 0] } },
        },
      },
    ]);
    await CourseSection.updateOne(
      { _id: section._id },
      {
        totalVideos: stats[0]?.count ?? 0,
        totalDurationMinutes: minutesFromSeconds(stats[0]?.durationMinutes ?? 0),
      },
    );
  }

  // Per-enrollment progress: recompute from actual completed-progress rows so
  // dedupe + the larger curriculum are both reflected.
  const targetEnrollments = await CourseEnrollment.find({ courseId: target._id }).select(
    "_id",
  );
  const completionGroups = await VideoProgress.aggregate<{
    _id: unknown;
    completedCount: number;
  }>([
    { $match: { courseId: target._id, isCompleted: true } },
    { $group: { _id: "$enrollmentId", completedCount: { $sum: 1 } } },
  ]);
  const completedByEnrollment = new Map(
    completionGroups.map((group) => [String(group._id), group.completedCount]),
  );

  if (targetEnrollments.length > 0) {
    await CourseEnrollment.bulkWrite(
      targetEnrollments.map((enrollment) => {
        const completedVideoCount =
          completedByEnrollment.get(enrollment._id.toString()) ?? 0;
        return {
          updateOne: {
            filter: { _id: enrollment._id },
            update: {
              $set: {
                completedVideoCount,
                totalVideoCount,
                overallProgressPercent: calculateOverallProgressPercent(
                  completedVideoCount,
                  totalVideoCount,
                ),
              },
            },
          },
        };
      }),
    );
  }

  const summary = {
    target: {
      courseId: target._id.toString(),
      title: target.title,
      slug: target.slug ?? "",
      isNew: Boolean(newCourseTitle),
    },
    sources: impacts,
    deactivatedCoupons,
    targetTotals: { totalVideoCount, totalDurationMinutes, enrollmentCount },
  };

  await CourseMergeLog.create({
    targetCourseId: target._id,
    sourceCourseIds: sources.map((source) => source._id),
    sourceTitles: sources.map((source) => source.title),
    performedBy: adminId,
    summary,
  }).catch((error) => {
    console.error("[course-merge] Failed to write merge log:", error);
  });

  return { ok: true, payload: { dryRun: false, ...summary } };
}
