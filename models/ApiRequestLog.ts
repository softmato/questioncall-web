import { HydratedDocument, InferSchemaType, Schema, model, models } from "mongoose";

const apiRequestLogSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    // Null for pre-auth endpoints (login, OTP, register), where the caller has
    // no user yet and the bucket is keyed on `subject` instead.
    userId: {
      type: String,
      default: null,
      index: true,
    },
    /** The bucket subject: a userId, or a pre-auth key like `email:…` / `ip:…`. */
    subject: {
      type: String,
      default: null,
      index: true,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    // Indexed only by the TTL index below: a second plain index on the same
    // key conflicts with it, and whichever one MongoDB built first wins.
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    versionKey: false,
  },
);

apiRequestLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type ApiRequestLogRecord = InferSchemaType<typeof apiRequestLogSchema>;
export type ApiRequestLogDocument = HydratedDocument<ApiRequestLogRecord>;

const ApiRequestLog =
  models.ApiRequestLog || model("ApiRequestLog", apiRequestLogSchema);

export default ApiRequestLog;
