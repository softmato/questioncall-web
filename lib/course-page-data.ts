import "server-only";

import { Types } from "mongoose";

import { connectToDatabase } from "@/lib/mongodb";
import { getQuizSubscriptionSnapshot } from "@/lib/quiz";
import Course from "@/models/Course";
import CourseEnrollment from "@/models/CourseEnrollment";
import CourseSection from "@/models/CourseSection";
import CourseVideo from "@/models/CourseVideo";
import LiveSession from "@/models/LiveSession";
import {
  getManualPaymentDetails,
  getPlatformConfig,
} from "@/models/PlatformConfig";
import Transaction from "@/models/Transaction";
import VideoProgress from "@/models/VideoProgress";
import { APP_NAME } from "@/lib/constants";

export type CoursePricingModel = "FREE" | "SUBSCRIPTION_INCLUDED" | "PAID";
export type CourseStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
export type UserRole = "STUDENT" | "TEACHER" | "ADMIN" | null;

export type CourseCardData = {
  _id: string;
  slug: string;
  title: string;
  description: string;
  subject: string;
  level: string;
  pricingModel: CoursePricingModel;
  price: number | null;
  thumbnailUrl: string | null;
  totalDurationMinutes: number;
  enrollmentCount: number;
  instructorName: string;
  instructorRole: string;
  isFeatured: boolean;
  liveSessionsEnabled: boolean;
  lessonsCount: number;
  overallProgressPercent?: number;
  completedVideoCount?: number;
  totalVideoCount?: number;
  lastWatchedVideoId?: string | null;
  accessType?: string | null;
};

export type DetailVideoData = {
  _id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  order: number;
  thumbnailUrl: string | null;
  isLiveRecording: boolean;
  viewCount: number;
};

export type DetailSectionData = {
  _id: string;
  title: string;
  description: string | null;
  order: number;
  totalVideos: number;
  totalDurationMinutes: number;
  videos: DetailVideoData[];
};

export type DetailLiveSessionData = {
  _id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number | null;
  status: string;
  zoomLink: string | null;
  notificationsSent: boolean;
  recordingUrl: string | null;
};

export type CourseDetailData = {
  _id: string;
  slug: string;
  title: string;
  description: string;
  subject: string;
  level: string;
  pricingModel: CoursePricingModel;
  price: number | null;
  freePreviewCount: number;
  thumbnailUrl: string | null;
  totalDurationMinutes: number;
  enrollmentCount: number;
  instructorName: string;
  instructorRole: string;
  isFeatured: boolean;
  status: CourseStatus;
  tags: string[];
  liveSessionsEnabled: boolean;
  startDate: string | null;
  expectedEndDate: string | null;
  sections: DetailSectionData[];
  liveSessions: DetailLiveSessionData[];
  lessonsCount: number;
  overallProgressPercent: number | null;
  completedVideoIds: string[];
  watchedPercentByVideoId: Record<string, number>;
  hasAccess: boolean;
  canManage: boolean;
  hasActiveSubscription: boolean;
  accessType: string | null;
  nextVideoId: string | null;
  pendingPurchase: boolean;
  appliedCoupon: { code: string; discountPercentage: number } | null;
  manualPayment: {
    recipientName: string;
    esewaNumber: string;
    qrCodeUrl: string;
  };
};

export type ManageCourseData = {
  course: {
    _id: string;
    slug: string;
    title: string;
    description: string;
    subject: string;
    level: string;
    pricingModel: CoursePricingModel;
    price: number | null;
    freePreviewCount: number;
    status: CourseStatus;
    isFeatured: boolean;
    thumbnailUrl: string | null;
    startDate: string | null;
    expectedEndDate: string | null;
    liveSessionsEnabled: boolean;
  };
  sections: Array<{
    _id: string;
    title: string;
    description: string | null;
    order: number;
    videos: Array<{
      _id: string;
      title: string;
      durationMinutes: number;
      order: number;
      viewCount: number;
      status: string;
      muxPlaybackId: string | null;
      videoUrl: string | null;
    }>;
  }>;
  liveSessions: DetailLiveSessionData[];
  analytics: {
    enrollmentCount: number;
    avgProgressPercent: number;
    topVideos: Array<{ _id: string; title: string; viewCount: number }>;
  };
  commissionPercent: number;
};

export type WatchPageData = {
  course: {
    _id: string;
    slug: string;
    title: string;
    freePreviewCount: number;
  };
  currentVideo: {
    _id: string;
    title: string;
    description: string | null;
    videoUrl: string | null;
    muxPlaybackId: string | null;
    durationMinutes: number;
  };
  sections: DetailSectionData[];
  completedVideoIds: string[];
  initialWatchedPercent: number;
  // True when the viewer is watching this video as a free preview (not enrolled,
  // not the instructor/admin). The client shows an upsell and skips progress.
  isPreview: boolean;
};

function toCourseCardData(
  course: {
    _id: Types.ObjectId;
    slug: string;
    title: string;
    description?: string | null;
    subject?: string | null;
    level?: string | null;
    pricingModel: CoursePricingModel;
    price?: number | null;
    thumbnailUrl?: string | null;
    totalDurationMinutes?: number | null;
    enrollmentCount?: number | null;
    instructorName?: string | null;
    instructorRole?: string | null;
    isFeatured?: boolean | null;
    liveSessionsEnabled?: boolean | null;
  },
  lessonsCount: number,
): CourseCardData {
  return {
    _id: course._id.toString(),
    slug: course.slug,
    title: course.title,
    description: course.description ?? "",
    subject: course.subject ?? "General",
    level: course.level ?? "All Levels",
    pricingModel: course.pricingModel,
    price: course.price ?? null,
    thumbnailUrl: course.thumbnailUrl ?? null,
    totalDurationMinutes: course.totalDurationMinutes ?? 0,
    enrollmentCount: course.enrollmentCount ?? 0,
    instructorName: course.instructorName ?? APP_NAME,
    instructorRole: course.instructorRole ?? "TEACHER",
    isFeatured: Boolean(course.isFeatured),
    liveSessionsEnabled: Boolean(course.liveSessionsEnabled),
    lessonsCount,
  };
}

function sortSectionsAndVideos(
  sections: Array<{
    _id: Types.ObjectId;
    title: string;
    description?: string | null;
    order: number;
    totalVideos?: number | null;
    totalDurationMinutes?: number | null;
  }>,
  videos: Array<{
    _id: Types.ObjectId;
    sectionId: Types.ObjectId;
    title: string;
    description?: string | null;
    durationMinutes: number;
    order: number;
    thumbnailUrl?: string | null;
    isLiveRecording?: boolean | null;
    viewCount?: number | null;
  }>,
): DetailSectionData[] {
  const videosBySectionId = new Map<string, DetailVideoData[]>();

  for (const video of videos) {
    const sectionId = video.sectionId.toString();
    const current = videosBySectionId.get(sectionId) ?? [];

    current.push({
      _id: video._id.toString(),
      title: video.title,
      description: video.description ?? null,
      durationMinutes: video.durationMinutes ?? 0,
      order: video.order,
      thumbnailUrl: video.thumbnailUrl ?? null,
      isLiveRecording: Boolean(video.isLiveRecording),
      viewCount: video.viewCount ?? 0,
    });

    current.sort((left, right) => left.order - right.order);
    videosBySectionId.set(sectionId, current);
  }

  return sections
    .map((section) => ({
      _id: section._id.toString(),
      title: section.title,
      description: section.description ?? null,
      order: section.order,
      totalVideos: section.totalVideos ?? 0,
      totalDurationMinutes: section.totalDurationMinutes ?? 0,
      videos: videosBySectionId.get(section._id.toString()) ?? [],
    }))
    .sort((left, right) => left.order - right.order);
}

function buildLessonCountMap(
  rows: Array<{ _id: Types.ObjectId; lessonsCount: number }>,
) {
  return new Map(rows.map((row) => [row._id.toString(), row.lessonsCount]));
}

function firstVideoId(sections: DetailSectionData[]) {
  for (const section of sections) {
    const firstVideo = section.videos[0];
    if (firstVideo) {
      return firstVideo._id;
    }
  }

  return null;
}

/**
 * The first `count` videos in curriculum order (section order, then video order)
 * are free to preview without enrollment. Returns their ids as a Set for O(1)
 * lookups. A count of 0 yields an empty set.
 */
function getFreePreviewVideoIds(
  sections: DetailSectionData[],
  count: number,
): Set<string> {
  if (!Number.isFinite(count) || count <= 0) {
    return new Set();
  }

  const ids = sections
    .flatMap((section) => section.videos)
    .slice(0, count)
    .map((video) => video._id);

  return new Set(ids);
}

export async function getCourseBrowsePageData(input: {
  userId?: string | null;
  role?: UserRole;
}) {
  await connectToDatabase();

  // `mergedInto: null` — a course that was merged away is a shell: its videos,
  // sections and students now live on the target course, so it must never be
  // browsable even if its status was flipped back to ACTIVE.
  const courses = await Course.find({ status: "ACTIVE", mergedInto: null })
    .sort({ isFeatured: -1, createdAt: -1 })
    .select(
      "_id slug title description subject level pricingModel price thumbnailUrl totalDurationMinutes enrollmentCount instructorName instructorRole isFeatured liveSessionsEnabled",
    )
    .lean();

  const courseIds = courses.map((course) => course._id);
  const lessonCountsRaw =
    courseIds.length > 0
      ? await CourseVideo.aggregate<{ _id: Types.ObjectId; lessonsCount: number }>([
          {
            $match: {
              courseId: { $in: courseIds },
            },
          },
          {
            $group: {
              _id: "$courseId",
              lessonsCount: { $sum: 1 },
            },
          },
        ])
      : [];

  const lessonCounts = buildLessonCountMap(lessonCountsRaw);
  const courseCards = courses.map((course) =>
    toCourseCardData(course, lessonCounts.get(course._id.toString()) ?? 0),
  );

  let enrolledCourses: CourseCardData[] = [];
  if (input.userId && input.role === "STUDENT" && courseIds.length > 0) {
    const enrollments = await CourseEnrollment.find({
      studentId: input.userId,
      courseId: { $in: courseIds },
    })
      .sort({ lastAccessedAt: -1, enrolledAt: -1 })
      .select(
        "courseId overallProgressPercent completedVideoCount totalVideoCount accessType",
      )
      .lean();

    const enrollmentByCourseId = new Map(
      enrollments.map((enrollment) => [enrollment.courseId.toString(), enrollment]),
    );

    for (const course of courseCards) {
      if (enrollmentByCourseId.has(course._id)) {
        const enrollment = enrollmentByCourseId.get(course._id);
        course.overallProgressPercent = enrollment?.overallProgressPercent ?? 0;
        course.completedVideoCount = enrollment?.completedVideoCount ?? 0;
        course.totalVideoCount = enrollment?.totalVideoCount ?? course.lessonsCount;
        course.accessType = enrollment?.accessType ?? null;
      }
    }

    enrolledCourses = courseCards
      .filter((course) => typeof course.overallProgressPercent === "number")
      .slice(0, 6);
  }

  let managedCourses: CourseCardData[] = [];
  if (
    input.userId &&
    (input.role === "TEACHER" || input.role === "ADMIN")
  ) {
    const ownCourses = await Course.find({ instructorId: input.userId })
      .sort({ createdAt: -1 })
      .select(
        "_id slug title description subject level pricingModel price thumbnailUrl totalDurationMinutes enrollmentCount instructorName instructorRole isFeatured liveSessionsEnabled",
      )
      .lean();

    const ownCourseIds = ownCourses.map((course) => course._id);
    const ownLessonCountsRaw =
      ownCourseIds.length > 0
        ? await CourseVideo.aggregate<{ _id: Types.ObjectId; lessonsCount: number }>([
            {
              $match: {
                courseId: { $in: ownCourseIds },
              },
            },
            {
              $group: {
                _id: "$courseId",
                lessonsCount: { $sum: 1 },
              },
            },
          ])
        : [];
    const ownLessonCounts = buildLessonCountMap(ownLessonCountsRaw);

    managedCourses = ownCourses
      .map((course) =>
        toCourseCardData(course, ownLessonCounts.get(course._id.toString()) ?? 0),
      )
      .slice(0, 6);
  }

  return {
    courses: courseCards,
    featuredCourses: courseCards.filter((course) => course.isFeatured),
    enrolledCourses,
    managedCourses,
    subjects: [...new Set(courseCards.map((course) => course.subject))].sort(),
    levels: [...new Set(courseCards.map((course) => course.level))].sort(),
    stats: {
      totalCourses: courseCards.length,
      totalEnrollments: courseCards.reduce(
        (sum, course) => sum + course.enrollmentCount,
        0,
      ),
      totalInstructors: new Set(
        courseCards.map((course) => `${course.instructorName}:${course.instructorRole}`),
      ).size,
    },
  };
}

export async function getCourseDetailPageData(input: {
  slug: string;
  userId?: string | null;
  role?: UserRole;
}): Promise<CourseDetailData | null> {
  await connectToDatabase();

  const course = await Course.findOne({ slug: input.slug }).lean();
  if (!course) {
    return null;
  }

  const canManage =
    input.role === "ADMIN" ||
    (Boolean(input.userId) &&
      course.instructorId.toString() === input.userId);

  if (course.status !== "ACTIVE" && !canManage) {
    return null;
  }

  // Merged away — hand off to the caller's redirect so the student lands on the
  // course that actually holds the content.
  if (course.mergedInto && !canManage) {
    return null;
  }

  const [sectionsRaw, videosRaw, liveSessionsRaw, config] = await Promise.all([
    CourseSection.find({ courseId: course._id })
      .sort({ order: 1 })
      .lean(),
    CourseVideo.find({ courseId: course._id })
      .sort({ sectionId: 1, order: 1 })
      .lean(),
    LiveSession.find({ courseId: course._id })
      .sort({ scheduledAt: 1, createdAt: 1 })
      .lean(),
    getPlatformConfig(),
  ]);

  const sections = sortSectionsAndVideos(sectionsRaw, videosRaw);
  const lessonsCount = sections.reduce(
    (sum, section) => sum + section.videos.length,
    0,
  );

  let enrollment:
    | {
        _id: Types.ObjectId;
        accessType: string;
        overallProgressPercent?: number | null;
      }
    | null = null;
  let progressItems: Array<{
    videoId: Types.ObjectId;
    watchedPercent?: number | null;
    isCompleted?: boolean | null;
  }> = [];
  let hasActiveSubscription = false;
  let pendingPurchase = false;
  let pendingTransaction: { _id: unknown; metadata?: Record<string, unknown> } | null = null;

  if (input.userId && input.role === "STUDENT") {
    const [enrollmentDoc, subscription, pendingTxn] = await Promise.all([
      CourseEnrollment.findOne({
        courseId: course._id,
        studentId: input.userId,
      })
        .select("_id accessType overallProgressPercent")
        .lean(),
      getQuizSubscriptionSnapshot(input.userId),
      Transaction.findOne({
        userId: input.userId,
        type: "COURSE_PURCHASE",
        status: "PENDING",
        "metadata.courseId": course._id.toString(),
      })
        .select("_id metadata")
        .lean(),
    ]);

    enrollment = enrollmentDoc;
    hasActiveSubscription = subscription.subscriptionStatus === "ACTIVE";
    pendingTransaction = pendingTxn as typeof pendingTransaction;
    pendingPurchase = Boolean(pendingTransaction);

    if (enrollmentDoc) {
      progressItems = await VideoProgress.find({
        studentId: input.userId,
        courseId: course._id,
      })
        .select("videoId watchedPercent isCompleted")
        .lean();
    }
  }

  const watchedPercentByVideoId: Record<string, number> = {};
  const completedVideoIds = progressItems
    .filter((item) => item.isCompleted)
    .map((item) => item.videoId.toString());

  for (const progressItem of progressItems) {
    watchedPercentByVideoId[progressItem.videoId.toString()] =
      progressItem.watchedPercent ?? 0;
  }

  const hasAccess = Boolean(enrollment) || canManage;
  const nextVideoId =
    hasAccess && lessonsCount > 0
      ? sections
          .flatMap((section) => section.videos)
          .find((video) => !completedVideoIds.includes(video._id))?._id ??
        firstVideoId(sections)
      : null;

  return {
    _id: course._id.toString(),
    slug: course.slug,
    title: course.title,
    description: course.description,
    subject: course.subject,
    level: course.level,
    pricingModel: course.pricingModel,
    price: course.price ?? null,
    freePreviewCount: course.freePreviewCount ?? 0,
    thumbnailUrl: course.thumbnailUrl ?? null,
    totalDurationMinutes: course.totalDurationMinutes ?? 0,
    enrollmentCount: course.enrollmentCount ?? 0,
    instructorName: course.instructorName,
    instructorRole: course.instructorRole,
    isFeatured: Boolean(course.isFeatured),
    status: course.status,
    tags: Array.isArray(course.tags) ? course.tags : [],
    liveSessionsEnabled: Boolean(course.liveSessionsEnabled),
    startDate: course.startDate ? new Date(course.startDate).toISOString() : null,
    expectedEndDate: course.expectedEndDate
      ? new Date(course.expectedEndDate).toISOString()
      : null,
    sections,
    liveSessions: liveSessionsRaw.map((session) => ({
      _id: session._id.toString(),
      title: session.title,
      scheduledAt: new Date(session.scheduledAt).toISOString(),
      durationMinutes: session.durationMinutes ?? null,
      status: session.status,
      zoomLink: session.zoomLink ?? null,
      notificationsSent: Boolean(session.notificationsSent),
      recordingUrl: session.recordingUrl ?? null,
    })),
    lessonsCount,
    overallProgressPercent: enrollment?.overallProgressPercent ?? null,
    completedVideoIds,
    watchedPercentByVideoId,
    hasAccess,
    canManage,
    hasActiveSubscription,
    accessType: canManage ? "MANAGE" : enrollment?.accessType ?? null,
    nextVideoId,
    pendingPurchase,
    appliedCoupon: (() => {
      if (!pendingTransaction) return null;
      const meta = (pendingTransaction as { metadata?: Record<string, unknown> }).metadata;
      const code = typeof meta?.couponCode === "string" ? meta.couponCode : null;
      const pct = typeof meta?.discountPercentage === "number" ? meta.discountPercentage : null;
      if (code && pct && pct > 0) return { code, discountPercentage: pct };
      return null;
    })(),
    manualPayment: getManualPaymentDetails(config),
  };
}

export async function getMyCoursesPageData(studentId: string) {
  await connectToDatabase();

  const enrollments = await CourseEnrollment.find({ studentId })
    .sort({ lastAccessedAt: -1, enrolledAt: -1 })
    .select(
      "_id courseId overallProgressPercent completedVideoCount totalVideoCount accessType",
    )
    .lean();

  if (enrollments.length === 0) {
    return [];
  }

  const courseIds = enrollments.map((enrollment) => enrollment.courseId);

  const [courses, latestProgressItems] = await Promise.all([
    Course.find({ _id: { $in: courseIds } })
      .select(
        "_id slug title thumbnailUrl subject instructorName pricingModel price totalDurationMinutes",
      )
      .lean(),
    VideoProgress.find({ studentId, courseId: { $in: courseIds } })
      .sort({ lastWatchedAt: -1 })
      .select("courseId videoId")
      .lean(),
  ]);

  const courseById = new Map(
    courses.map((course) => [course._id.toString(), course]),
  );
  const lastWatchedVideoIdByCourseId = new Map<string, string>();

  for (const progressItem of latestProgressItems) {
    const key = progressItem.courseId.toString();
    if (!lastWatchedVideoIdByCourseId.has(key)) {
      lastWatchedVideoIdByCourseId.set(key, progressItem.videoId.toString());
    }
  }

  return enrollments
    .map((enrollment) => {
      const course = courseById.get(enrollment.courseId.toString());
      if (!course) {
        return null;
      }

      return {
        _id: course._id.toString(),
        slug: course.slug,
        title: course.title,
        thumbnailUrl: course.thumbnailUrl ?? null,
        subject: course.subject ?? "General",
        instructorName: course.instructorName ?? APP_NAME,
        pricingModel: course.pricingModel,
        price: course.price ?? null,
        totalDurationMinutes: course.totalDurationMinutes ?? 0,
        totalVideos: enrollment.totalVideoCount ?? 0,
        watchedVideos: enrollment.completedVideoCount ?? 0,
        progressPercent: enrollment.overallProgressPercent ?? 0,
        lastWatchedVideoId:
          lastWatchedVideoIdByCourseId.get(enrollment.courseId.toString()) ?? null,
        accessType: enrollment.accessType,
      };
    })
    .filter((course): course is NonNullable<typeof course> => Boolean(course));
}

export async function getManageCoursePageData(input: {
  slug: string;
  userId: string;
  role: Exclude<UserRole, null>;
}): Promise<ManageCourseData | null> {
  await connectToDatabase();

  const course = await Course.findOne({ slug: input.slug }).lean();
  if (!course) {
    return null;
  }

  const canManage =
    input.role === "ADMIN" ||
    course.instructorId.toString() === input.userId;

  if (!canManage) {
    return null;
  }

  const [sectionsRaw, videosRaw, liveSessionsRaw, avgProgressRaw, topVideosRaw, config] =
    await Promise.all([
      CourseSection.find({ courseId: course._id })
        .sort({ order: 1 })
        .lean(),
      CourseVideo.find({ courseId: course._id })
        .sort({ sectionId: 1, order: 1 })
        .lean(),
      LiveSession.find({ courseId: course._id })
        .sort({ scheduledAt: 1, createdAt: 1 })
        .lean(),
      CourseEnrollment.aggregate<{ _id: null; avgProgressPercent: number }>([
        {
          $match: {
            courseId: course._id,
          },
        },
        {
          $group: {
            _id: null,
            avgProgressPercent: { $avg: "$overallProgressPercent" },
          },
        },
      ]),
      CourseVideo.find({ courseId: course._id })
        .sort({ viewCount: -1, uploadedAt: -1 })
        .limit(5)
        .select("_id title viewCount")
        .lean(),
      getPlatformConfig(),
    ]);

  const sections = sortSectionsAndVideos(sectionsRaw, videosRaw).map((section) => ({
    _id: section._id,
    title: section.title,
    description: section.description,
    order: section.order,
    videos: section.videos.map((video) => {
      const rawVideo = videosRaw.find((v) => v._id.toString() === video._id) as
        | { status?: string; muxPlaybackId?: string | null; videoUrl?: string | null }
        | undefined;
      return {
        _id: video._id,
        title: video.title,
        durationMinutes: video.durationMinutes,
        order: video.order,
        viewCount: video.viewCount,
        status: rawVideo?.status ?? "READY",
        muxPlaybackId: rawVideo?.muxPlaybackId ?? null,
        videoUrl: rawVideo?.videoUrl ?? null,
      };
    }),
  }));

  return {
    course: {
      _id: course._id.toString(),
      slug: course.slug,
      title: course.title,
      description: course.description,
      subject: course.subject,
      level: course.level,
      pricingModel: course.pricingModel,
      price: course.price ?? null,
      freePreviewCount: course.freePreviewCount ?? 0,
      status: course.status,
      isFeatured: Boolean(course.isFeatured),
      thumbnailUrl: course.thumbnailUrl ?? null,
      startDate: course.startDate ? new Date(course.startDate).toISOString() : null,
      expectedEndDate: course.expectedEndDate
        ? new Date(course.expectedEndDate).toISOString()
        : null,
      liveSessionsEnabled: Boolean(course.liveSessionsEnabled),
    },
    sections,
    liveSessions: liveSessionsRaw.map((session) => ({
      _id: session._id.toString(),
      title: session.title,
      scheduledAt: new Date(session.scheduledAt).toISOString(),
      durationMinutes: session.durationMinutes ?? null,
      status: session.status,
      zoomLink: session.zoomLink ?? null,
      notificationsSent: Boolean(session.notificationsSent),
      recordingUrl: session.recordingUrl ?? null,
    })),
    analytics: {
      enrollmentCount: course.enrollmentCount ?? 0,
      avgProgressPercent: Math.round(avgProgressRaw[0]?.avgProgressPercent ?? 0),
      topVideos: topVideosRaw.map((video) => ({
        _id: video._id.toString(),
        title: video.title,
        viewCount: video.viewCount ?? 0,
      })),
    },
    commissionPercent: config.coursePurchaseCommissionPercent ?? 0,
  };
}

export async function getCourseWatchPageData(input: {
  // Anonymous visitors (userId null) are allowed in: they can only ever reach a
  // free-preview video, which is what makes previews indexable by search engines.
  slug: string;
  videoId: string;
  userId: string | null;
  role: UserRole;
}): Promise<WatchPageData | null> {
  await connectToDatabase();

  const course = await Course.findOne({ slug: input.slug }).lean();
  if (!course) {
    return null;
  }

  const canManage =
    Boolean(input.userId) &&
    (input.role === "ADMIN" ||
      course.instructorId.toString() === input.userId);

  // A draft/archived course must never be reachable by the public, even at a
  // preview URL — only its instructor/admin can open it.
  if (course.status !== "ACTIVE" && !canManage) {
    return null;
  }

  const enrollment =
    canManage || !input.userId
      ? null
      : await CourseEnrollment.findOne({
          courseId: course._id,
          studentId: input.userId,
        })
          .select("_id")
          .lean();

  const [currentVideo, sectionsRaw, videosRaw, progressItems] = await Promise.all([
    CourseVideo.findOne({
      _id: input.videoId,
      courseId: course._id,
    }).lean(),
    CourseSection.find({ courseId: course._id })
      .sort({ order: 1 })
      .lean(),
    CourseVideo.find({ courseId: course._id })
      .sort({ sectionId: 1, order: 1 })
      .lean(),
    canManage || !enrollment || !input.userId
      ? Promise.resolve([])
      : VideoProgress.find({
          studentId: input.userId,
          courseId: course._id,
        })
          .select("videoId watchedPercent isCompleted")
          .lean(),
  ]);

  if (!currentVideo) {
    return null;
  }

  const sections = sortSectionsAndVideos(sectionsRaw, videosRaw);

  // Non-enrolled viewers may only watch a video if it's one of the first N
  // free-preview videos in curriculum order. Enrolled users and the
  // instructor/admin always have full access.
  const isPreview =
    !canManage &&
    !enrollment &&
    getFreePreviewVideoIds(sections, course.freePreviewCount ?? 0).has(
      currentVideo._id.toString(),
    );

  if (!canManage && !enrollment && !isPreview) {
    return null;
  }

  const currentProgress = progressItems.find(
    (item) => item.videoId.toString() === currentVideo._id.toString(),
  );

  return {
    course: {
      _id: course._id.toString(),
      slug: course.slug,
      title: course.title,
      freePreviewCount: course.freePreviewCount ?? 0,
    },
    currentVideo: {
      _id: currentVideo._id.toString(),
      title: currentVideo.title,
      description: currentVideo.description ?? null,
      videoUrl: currentVideo.videoUrl ?? null,
      muxPlaybackId: currentVideo.muxPlaybackId ?? null,
      durationMinutes: currentVideo.durationMinutes ?? 0,
    },
    sections,
    completedVideoIds: progressItems
      .filter((item) => item.isCompleted)
      .map((item) => item.videoId.toString()),
    initialWatchedPercent: currentProgress?.watchedPercent ?? 0,
    isPreview,
  };
}
