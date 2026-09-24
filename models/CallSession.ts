import { HydratedDocument, InferSchemaType, Schema, model, models } from "mongoose";

export const CALL_STATUSES = ["CREATED", "RINGING", "ACTIVE", "ENDED", "REJECTED", "MISSED"] as const;
export const CALL_MODES = ["AUDIO", "VIDEO"] as const;

export type CallStatus = (typeof CALL_STATUSES)[number];
export type CallMode = (typeof CALL_MODES)[number];

const callSessionSchema = new Schema(
  {
    channelId: {
      type: Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
      index: true,
    },
    roomName: {
      type: String,
      required: true,
      index: true,
    },
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    callerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    mode: {
      type: String,
      enum: CALL_MODES,
      required: true,
    },
    status: {
      type: String,
      enum: CALL_STATUSES,
      default: "CREATED",
      required: true,
      index: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Compound indexes
callSessionSchema.index({ channelId: 1, status: 1 });
callSessionSchema.index({ teacherId: 1, status: 1 });
callSessionSchema.index({ studentId: 1, status: 1 });
callSessionSchema.index({ callerId: 1, status: 1 });

// InferSchemaType does not pick up the fields `timestamps: true` adds, and the
// expiration/reaper code needs both of them to decide how long a session has
// been sitting there untouched.
export type CallSessionRecord = InferSchemaType<typeof callSessionSchema> & {
  createdAt: Date;
  updatedAt: Date;
};
export type CallSessionDocument = HydratedDocument<CallSessionRecord>;

const CallSession = models.CallSession || model("CallSession", callSessionSchema);

export default CallSession;
