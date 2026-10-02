import { normalizeDuration } from "@/lib/duration";
import { HydratedDocument, InferSchemaType, Schema, model, models } from "mongoose";

// A flat, ordered item inside a Chapter. Unlike CourseVideo (which belongs to a
// CourseSection), chapter contents hang directly off the chapter — no sections.
// A content item is either a VIDEO (Mux/Cloudinary or external link) or a DOC
// (any document/image uploaded to R2).
const CHAPTER_CONTENT_TYPES = ["VIDEO", "DOC"] as const;

const chapterContentSchema = new Schema(
  {
    chapterId: {
      type: Schema.Types.ObjectId,
      ref: "Chapter",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: CHAPTER_CONTENT_TYPES,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      default: null,
      trim: true,
    },
    order: {
      type: Number,
      required: true,
      min: 1,
    },

    // ── VIDEO fields ──────────────────────────────────────────────────────
    videoUrl: {
      type: String,
      default: null,
      trim: true,
    },
    muxUploadId: {
      type: String,
      default: null,
      trim: true,
    },
    muxAssetId: {
      type: String,
      default: null,
      trim: true,
    },
    muxPlaybackId: {
      type: String,
      default: null,
      trim: true,
    },
    cloudinaryPublicId: {
      type: String,
      default: null,
      trim: true,
    },
    durationMinutes: {
      type: Number,
      set: normalizeDuration,
      default: 0,
      min: 0,
    },
    thumbnailUrl: {
      type: String,
      default: null,
      trim: true,
    },
    // PROCESSING/ERRORED only matter for uploaded videos; docs are READY at once.
    status: {
      type: String,
      enum: ["PROCESSING", "READY", "ERRORED"],
      default: "READY",
      index: true,
    },

    // ── DOC fields ────────────────────────────────────────────────────────
    fileUrl: {
      type: String,
      default: null,
      trim: true,
    },
    fileKey: {
      type: String,
      default: null,
      trim: true,
    },
    fileName: {
      type: String,
      default: null,
      trim: true,
    },
    fileType: {
      type: String,
      default: null,
      trim: true,
    },
    fileSizeBytes: {
      type: Number,
      default: 0,
      min: 0,
    },

    viewCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

chapterContentSchema.index(
  { chapterId: 1, order: 1 },
  { name: "chapter_content_order_idx" },
);

export type ChapterContentRecord = InferSchemaType<typeof chapterContentSchema>;
export type ChapterContentDocument = HydratedDocument<ChapterContentRecord>;

const ChapterContent =
  models.ChapterContent || model("ChapterContent", chapterContentSchema);

export default ChapterContent;
