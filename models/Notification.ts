import { HydratedDocument, InferSchemaType, Schema, model, models } from "mongoose";

/**
 * Every value `Notification.create({ type })` is called with, anywhere.
 *
 * This is a mongoose `enum`, so a type missing from this list doesn't degrade —
 * validation rejects the document and the notification is never recorded. Six
 * types (the social ones, CHAT_MESSAGE, and both NEW_QUESTION_* ) were being
 * written without being listed here, so their in-app records silently never
 * saved; `notifyUser` swallows the create error and still sends the push, which
 * is why only the notification center looked wrong. Keep this in step with
 * lib/notifications/metadata.ts and lib/notification-prefs.ts.
 */
export const NOTIFICATION_TYPES = [
  "RATING_RECEIVED",
  "QUESTION_ACCEPTED",
  "QUESTION_RESET",
  "CHANNEL_CLOSED",
  "CHANNEL_EXPIRED",
  "PAYMENT",
  "ANSWER_SUBMITTED",
  "DEADLINE_WARNING",
  "DAILY_TARGET_BONUS",
  "COURSE_VIDEO_READY",
  "NEW_QUESTION_POSTED",
  "NEW_QUESTION_INTEREST",
  "CHAT_MESSAGE",
  "REACTION_RECEIVED",
  "COMMENT_RECEIVED",
  "PROFILE_VIEWED",
  "NEW_FOLLOWER",
  "SYSTEM",
] as const;

const notificationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    href: {
      type: String,
      default: null,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

export type NotificationRecord = InferSchemaType<typeof notificationSchema>;
export type NotificationDocument = HydratedDocument<NotificationRecord>;

const Notification = models.Notification || model("Notification", notificationSchema);

export default Notification;
