import { normalizeDuration } from "@/lib/duration";
import { HydratedDocument, InferSchemaType, Schema, model, models } from "mongoose";

const courseVideoSchema = new Schema(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    sectionId: {
      type: Schema.Types.ObjectId,
      ref: "CourseSection",
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
    status: {
      type: String,
      enum: ["PROCESSING", "READY", "ERRORED"],
      default: "READY",
      index: true,
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
    isLiveRecording: {
      type: Boolean,
      default: false,
    },
    liveSessionId: {
      type: Schema.Types.ObjectId,
      ref: "LiveSession",
      default: null,
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

courseVideoSchema.index({ sectionId: 1, order: 1 }, { name: "course_video_section_order_idx" });

export type CourseVideoRecord = InferSchemaType<typeof courseVideoSchema>;
export type CourseVideoDocument = HydratedDocument<CourseVideoRecord>;

const CourseVideo = models.CourseVideo || model("CourseVideo", courseVideoSchema);

export default CourseVideo;
