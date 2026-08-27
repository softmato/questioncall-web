import { HydratedDocument, InferSchemaType, Schema, model, models } from "mongoose";

/**
 * One row per (question, reactor) whose reaction notification has not been sent
 * yet.
 *
 * Reactions are a toggle, so a single user tapping the same heart four times
 * used to fire four pushes at the asker. Instead of sending on the tap, the tap
 * writes (or refreshes) this row and the push goes out only once the reactor
 * has been still for REACTION_NOTIFY_QUIET_MS — see lib/reaction-notifications.
 *
 * Everything the eventual notification needs is snapshotted here (reactor name,
 * question summary, asker id) so the flush is a single query with no joins, and
 * so the wording still makes sense if the question is edited in between.
 */
const pendingReactionNotificationSchema = new Schema(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
      index: true,
    },
    /** Denormalized so the flush never has to re-read the question. */
    askerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reactorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    /** Snapshot — the notification reads the same even if the user renames. */
    reactorName: {
      type: String,
      required: true,
      trim: true,
    },
    /** Latest reaction type; a switch from like → same_doubt overwrites it. */
    reactionType: {
      type: String,
      required: true,
    },
    /** Snapshot of questionSummary() at reaction time. */
    questionSummary: {
      type: String,
      default: "",
      trim: true,
    },
    /**
     * Refreshed on every reaction from this user on this question. The flush
     * only picks up rows whose value is older than the quiet window, which is
     * what makes rapid toggling collapse into one push.
     */
    lastReactedAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// One pending notification per reactor per question — the upsert on react
// depends on this to collapse repeat taps instead of inserting duplicates.
pendingReactionNotificationSchema.index(
  { questionId: 1, reactorId: 1 },
  { unique: true },
);

export type PendingReactionNotificationRecord = InferSchemaType<
  typeof pendingReactionNotificationSchema
>;
export type PendingReactionNotificationDocument =
  HydratedDocument<PendingReactionNotificationRecord>;

const PendingReactionNotification =
  models.PendingReactionNotification ||
  model("PendingReactionNotification", pendingReactionNotificationSchema);

export default PendingReactionNotification;
