/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from "mongoose";

import { checkChapterAccess } from "@/lib/chapter-access";
import { connectToDatabase } from "@/lib/mongodb";
import { getPlatformConfig } from "@/models/PlatformConfig";
import Chapter from "@/models/Chapter";
import ChapterContent from "@/models/ChapterContent";
import ChapterEnrollment from "@/models/ChapterEnrollment";
import Transaction from "@/models/Transaction";

export type UserRole = "STUDENT" | "TEACHER" | "ADMIN" | null;
export type ChapterPricingModel = "FREE" | "SUBSCRIPTION_INCLUDED" | "PAID";
export type ChapterStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

export type ChapterContentData = {
  _id: string;
  type: "VIDEO" | "DOC";
  title: string;
  description: string | null;
  order: number;
  durationMinutes: number;
  status: "PROCESSING" | "READY" | "ERRORED";
  thumbnailUrl: string | null;
  fileName: string | null;
  fileType: string | null;
  fileSizeBytes: number;
  viewCount: number;
};

export type ChapterCardData = {
  _id: string;
  slug: string;
  title: string;
  description: string;
  subject: string;
  level: string;
  pricingModel: ChapterPricingModel;
  price: number | null;
  thumbnailUrl: string | null;
  totalDurationMinutes: number;
  enrollmentCount: number;
  instructorName: string;
  status: ChapterStatus;
  freePreviewCount: number;
  contentsCount: number;
  overallProgressPercent?: number;
};

export type ChapterDetailData = ChapterCardData & {
  contents: ChapterContentData[];
  hasAccess: boolean;
  canManage: boolean;
  hasActiveSubscription: boolean;
  pendingPurchase: boolean;
  manualPayment: {
    recipientName: string;
    esewaNumber: string;
    qrCodeUrl: string;
  };
};

export type ChapterWatchData = {
  chapter: {
    _id: string;
    slug: string;
    title: string;
    freePreviewCount: number;
  };
  currentContent: ChapterContentData & {
    videoUrl: string | null;
    muxPlaybackId: string | null;
    fileUrl: string | null;
  };
  contents: ChapterContentData[];
  isPreview: boolean;
};

function toContentData(content: any): ChapterContentData {
  return {
    _id: content._id.toString(),
    type: content.type,
    title: content.title,
    description: content.description ?? null,
    order: content.order ?? 0,
    durationMinutes: content.durationMinutes ?? 0,
    status: content.status ?? "READY",
    thumbnailUrl: content.thumbnailUrl ?? null,
    fileName: content.fileName ?? null,
    fileType: content.fileType ?? null,
    fileSizeBytes: content.fileSizeBytes ?? 0,
    viewCount: content.viewCount ?? 0,
  };
}

function toCardData(chapter: any, contentsCount = 0): ChapterCardData {
  return {
    _id: chapter._id.toString(),
    slug: chapter.slug,
    title: chapter.title,
    description: chapter.description,
    subject: chapter.subject,
    level: chapter.level,
    pricingModel: chapter.pricingModel,
    price: chapter.price ?? null,
    thumbnailUrl: chapter.thumbnailUrl ?? null,
    totalDurationMinutes: chapter.totalDurationMinutes ?? 0,
    enrollmentCount: chapter.enrollmentCount ?? 0,
    instructorName: chapter.instructorName,
    status: chapter.status,
    freePreviewCount: chapter.freePreviewCount ?? 0,
    contentsCount,
  };
}

function previewIds(contents: ChapterContentData[], count: number) {
  if (!Number.isFinite(count) || count <= 0) return new Set<string>();
  return new Set(contents.slice(0, count).map((content) => content._id));
}

export async function getChapterBrowseData(input: {
  userId?: string | null;
  role?: UserRole;
}) {
  await connectToDatabase();

  const query: Record<string, unknown> =
    input.role === "ADMIN" ? {} : { status: "ACTIVE" };

  const chapters = await Chapter.find(query).sort({ isFeatured: -1, createdAt: -1 }).lean();
  const chapterIds = chapters.map((chapter: any) => chapter._id);

  const [contentCounts, enrollments] = await Promise.all([
    chapterIds.length
      ? ChapterContent.aggregate([
          { $match: { chapterId: { $in: chapterIds } } },
          { $group: { _id: "$chapterId", count: { $sum: 1 } } },
        ])
      : Promise.resolve([]),
    input.role === "STUDENT" && input.userId && chapterIds.length
      ? ChapterEnrollment.find({
          studentId: input.userId,
          chapterId: { $in: chapterIds },
        })
          .select("chapterId overallProgressPercent")
          .lean()
      : Promise.resolve([]),
  ]);

  const countById = new Map(contentCounts.map((entry: any) => [String(entry._id), entry.count]));
  const progressById = new Map(
    (enrollments as any[]).map((entry) => [
      String(entry.chapterId),
      entry.overallProgressPercent ?? 0,
    ]),
  );

  const cards = chapters.map((chapter: any) => {
    const card = toCardData(chapter, countById.get(chapter._id.toString()) ?? 0);
    const progress = progressById.get(card._id);
    return typeof progress === "number" ? { ...card, overallProgressPercent: progress } : card;
  });

  return {
    chapters: cards,
    featuredChapters: cards.filter((chapter) => chapter.status === "ACTIVE").slice(0, 3),
    enrolledChapters: cards.filter(
      (chapter) => typeof chapter.overallProgressPercent === "number",
    ),
    managedChapters:
      input.role === "TEACHER" || input.role === "ADMIN"
        ? cards.filter((chapter) =>
            input.role === "ADMIN"
              ? true
              : chapters
                  .find((raw: any) => raw._id.toString() === chapter._id)
                  ?.instructorId?.toString() === input.userId,
          )
        : [],
    subjects: Array.from(new Set(cards.map((chapter) => chapter.subject).filter(Boolean))),
    levels: Array.from(new Set(cards.map((chapter) => chapter.level).filter(Boolean))),
  };
}

export async function getChapterDetailData(input: {
  slug: string;
  userId?: string | null;
  role?: UserRole;
}): Promise<ChapterDetailData | null> {
  await connectToDatabase();

  const chapter = await Chapter.findOne({ slug: input.slug }).lean();
  if (!chapter) return null;

  const canManage =
    input.role === "ADMIN" ||
    Boolean(input.userId && chapter.instructorId.toString() === input.userId);
  if (!canManage && chapter.status !== "ACTIVE") return null;

  const [contentsRaw, enrollment, config, pendingTransaction] = await Promise.all([
    ChapterContent.find({ chapterId: chapter._id }).sort({ order: 1 }).lean(),
    input.role === "STUDENT" && input.userId
      ? ChapterEnrollment.findOne({
          chapterId: chapter._id,
          studentId: input.userId,
        }).lean()
      : Promise.resolve(null),
    getPlatformConfig(),
    input.role === "STUDENT" && input.userId
      ? Transaction.findOne({
          userId: input.userId,
          type: "CHAPTER_PURCHASE",
          status: "PENDING",
          "metadata.chapterId": chapter._id.toString(),
        }).lean()
      : Promise.resolve(null),
  ]);

  const hasAccess =
    canManage ||
    Boolean(enrollment) ||
    chapter.pricingModel === "FREE" ||
    (chapter.pricingModel === "SUBSCRIPTION_INCLUDED" && false);

  return {
    ...toCardData(chapter, contentsRaw.length),
    contents: contentsRaw.map(toContentData),
    hasAccess,
    canManage,
    hasActiveSubscription: false,
    pendingPurchase: Boolean(pendingTransaction),
    manualPayment: {
      recipientName: config.manualPaymentRecipientName ?? "QuestionCall",
      esewaNumber: config.manualPaymentEsewaNumber ?? "",
      qrCodeUrl: config.manualPaymentQrCodeUrl ?? "",
    },
  };
}

export async function getChapterManageData(input: {
  id: string;
  userId: string;
  role: Exclude<UserRole, null>;
}): Promise<ChapterDetailData | null> {
  if (!Types.ObjectId.isValid(input.id)) return null;
  await connectToDatabase();

  const chapter = await Chapter.findById(input.id).lean();
  if (!chapter) return null;

  const canManage =
    input.role === "ADMIN" || chapter.instructorId.toString() === input.userId;
  if (!canManage) return null;

  const [contentsRaw, config] = await Promise.all([
    ChapterContent.find({ chapterId: chapter._id }).sort({ order: 1 }).lean(),
    getPlatformConfig(),
  ]);

  return {
    ...toCardData(chapter, contentsRaw.length),
    contents: contentsRaw.map(toContentData),
    hasAccess: true,
    canManage: true,
    hasActiveSubscription: false,
    pendingPurchase: false,
    manualPayment: {
      recipientName: config.manualPaymentRecipientName ?? "QuestionCall",
      esewaNumber: config.manualPaymentEsewaNumber ?? "",
      qrCodeUrl: config.manualPaymentQrCodeUrl ?? "",
    },
  };
}

export async function getChapterWatchData(input: {
  // Anonymous visitors (userId null) are allowed in: without an account they can
  // only ever resolve a free-preview item, which is what makes previews
  // indexable by search engines.
  slug: string;
  contentId: string;
  userId: string | null;
  role: UserRole;
}): Promise<ChapterWatchData | null> {
  await connectToDatabase();

  const chapter = await Chapter.findOne({ slug: input.slug }).lean();
  if (!chapter || !Types.ObjectId.isValid(input.contentId)) return null;

  const canManage =
    input.role === "ADMIN" ||
    Boolean(input.userId && chapter.instructorId.toString() === input.userId);

  if (!canManage && chapter.status !== "ACTIVE") return null;

  const [contentsRaw, currentContent] = await Promise.all([
    ChapterContent.find({ chapterId: chapter._id }).sort({ order: 1 }).lean(),
    ChapterContent.findOne({
      _id: input.contentId,
      chapterId: chapter._id,
    }).lean(),
  ]);

  if (!currentContent) return null;

  const contents = contentsRaw.map(toContentData);
  const hasAccess =
    canManage ||
    chapter.pricingModel === "FREE" ||
    (input.userId
      ? await checkChapterAccess(input.userId, chapter._id.toString())
      : false);
  const isPreview =
    !hasAccess && previewIds(contents, chapter.freePreviewCount ?? 0).has(input.contentId);

  if (!hasAccess && !isPreview) return null;

  return {
    chapter: {
      _id: chapter._id.toString(),
      slug: chapter.slug,
      title: chapter.title,
      freePreviewCount: chapter.freePreviewCount ?? 0,
    },
    currentContent: {
      ...toContentData(currentContent),
      videoUrl: currentContent.videoUrl ?? null,
      muxPlaybackId: currentContent.muxPlaybackId ?? null,
      fileUrl: currentContent.fileUrl ?? null,
    },
    contents,
    isPreview,
  };
}
