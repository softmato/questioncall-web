import { normalizeDuration } from "@/lib/duration";
import { HydratedDocument, InferSchemaType, Schema, model, models } from "mongoose";

const courseSectionSchema = new Schema(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
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
    totalVideos: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalDurationMinutes: {
      type: Number,
      set: normalizeDuration,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

courseSectionSchema.index({ courseId: 1, order: 1 }, { name: "course_section_order_idx" });

export type CourseSectionRecord = InferSchemaType<typeof courseSectionSchema>;
export type CourseSectionDocument = HydratedDocument<CourseSectionRecord>;

const CourseSection = models.CourseSection || model("CourseSection", courseSectionSchema);

export default CourseSection;
