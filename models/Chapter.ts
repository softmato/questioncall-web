import { normalizeDuration } from "@/lib/duration";
import {
  HydratedDocument,
  InferSchemaType,
  Model,
  Schema,
  model,
  models,
} from "mongoose";

// A Chapter is a standalone, simplified course: it has its own pricing and
// catalog entry like a Course, but its content is a single flat, ordered list
// of videos and documents (see ChapterContent) — there are no sections.
const CHAPTER_PRICING_MODELS = ["FREE", "SUBSCRIPTION_INCLUDED", "PAID"] as const;
const CHAPTER_STATUSES = ["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"] as const;
const CHAPTER_INSTRUCTOR_ROLES = ["TEACHER", "ADMIN"] as const;

const chapterSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    slug: {
      type: String,
      unique: true,
      index: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    subject: {
      type: String,
      required: false,
      default: "General",
      trim: true,
      index: true,
    },
    level: {
      type: String,
      required: false,
      default: "All Levels",
      trim: true,
      index: true,
    },
    pricingModel: {
      type: String,
      enum: CHAPTER_PRICING_MODELS,
      required: true,
      index: true,
    },
    price: {
      type: Number,
      default: null,
      min: 0,
    },
    // First N contents (in order) playable/openable without enrollment.
    freePreviewCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      enum: ["NPR"],
      default: "NPR",
      required: true,
    },
    status: {
      type: String,
      enum: CHAPTER_STATUSES,
      default: "DRAFT",
      index: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },
    thumbnailUrl: {
      type: String,
      default: null,
      trim: true,
    },
    totalDurationMinutes: {
      type: Number,
      set: normalizeDuration,
      default: 0,
      min: 0,
    },
    instructorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    instructorName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    instructorRole: {
      type: String,
      enum: CHAPTER_INSTRUCTOR_ROLES,
      required: true,
    },
    enrollmentCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    tags: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export type ChapterRecord = InferSchemaType<typeof chapterSchema>;
export type ChapterDocument = HydratedDocument<ChapterRecord>;

function slugifyTitle(title: string) {
  const normalized = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || "chapter";
}

async function generateUniqueSlug(chapter: ChapterDocument) {
  const ChapterModel = chapter.constructor as Model<ChapterRecord>;
  const baseSlug = slugifyTitle(chapter.title);
  let candidate = baseSlug;

  while (
    await ChapterModel.exists({
      slug: candidate,
      _id: { $ne: chapter._id },
    })
  ) {
    candidate = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;
  }

  return candidate;
}

chapterSchema.pre("validate", function () {
  if (this.pricingModel === "PAID") {
    if (typeof this.price !== "number" || Number.isNaN(this.price) || this.price <= 0) {
      this.invalidate("price", "Paid chapters must have a positive price.");
    }
  } else {
    this.price = null;
  }
});

chapterSchema.pre("save", async function () {
  if (this.isNew || this.isModified("title")) {
    this.slug = await generateUniqueSlug(this as ChapterDocument);
  }
});

const Chapter = models.Chapter || model("Chapter", chapterSchema);

export default Chapter;
