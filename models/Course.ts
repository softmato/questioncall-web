import { normalizeDuration } from "@/lib/duration";
import {
  HydratedDocument,
  InferSchemaType,
  Model,
  Schema,
  model,
  models,
} from "mongoose";

const COURSE_PRICING_MODELS = ["FREE", "SUBSCRIPTION_INCLUDED", "PAID"] as const;
const COURSE_STATUSES = ["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"] as const;
const COURSE_INSTRUCTOR_ROLES = ["TEACHER", "ADMIN"] as const;

const courseSchema = new Schema(
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
      enum: COURSE_PRICING_MODELS,
      required: true,
      index: true,
    },
    price: {
      type: Number,
      default: null,
      min: 0,
    },
    // Number of the first videos (in curriculum order) that are playable without
    // enrollment as a free preview. 0 = no preview. Applies to PAID/SUBSCRIPTION
    // courses; FREE courses are fully open regardless.
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
      enum: COURSE_STATUSES,
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
      enum: COURSE_INSTRUCTOR_ROLES,
      required: true,
    },
    enrollmentCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    liveSessionsEnabled: {
      type: Boolean,
      default: false,
    },
    startDate: {
      type: Date,
      default: null,
    },
    expectedEndDate: {
      type: Date,
      default: null,
    },
    tags: {
      type: [String],
      default: [],
    },
    // Set when an admin merged this course into another one. The course is
    // ARCHIVED at that point; detail/watch pages redirect old links to the
    // target course's slug.
    mergedInto: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

export type CourseRecord = InferSchemaType<typeof courseSchema>;
export type CourseDocument = HydratedDocument<CourseRecord>;

function slugifyTitle(title: string) {
  const normalized = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || "course";
}

async function generateUniqueSlug(course: CourseDocument) {
  const CourseModel = course.constructor as Model<CourseRecord>;
  const baseSlug = slugifyTitle(course.title);
  let candidate = baseSlug;

  while (
    await CourseModel.exists({
      slug: candidate,
      _id: { $ne: course._id },
    })
  ) {
    candidate = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;
  }

  return candidate;
}

courseSchema.pre("validate", function () {
  if (this.pricingModel === "PAID") {
    if (typeof this.price !== "number" || Number.isNaN(this.price) || this.price <= 0) {
      this.invalidate("price", "Paid courses must have a positive price.");
    }
  } else {
    this.price = null;
  }
});

courseSchema.pre("save", async function () {
  if (this.pricingModel === "FREE") {
    this.liveSessionsEnabled = false;
  }

  if (this.isNew || this.isModified("title")) {
    this.slug = await generateUniqueSlug(this as CourseDocument);
  }
});

const Course = models.Course || model("Course", courseSchema);

export default Course;
