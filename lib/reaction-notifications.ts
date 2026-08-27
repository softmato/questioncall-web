import "server-only";

import { notifyUser } from "@/lib/notifications/notify-user";
import { connectToDatabase } from "@/lib/mongodb";
import PendingReactionNotification from "@/models/PendingReactionNotification";
import Question from "@/models/Question";

/**
 * How long a reactor has to be still before their reaction notification is
 * delivered.
 *
 * Reactions are a toggle, so tapping the same heart on and off spammed the
 * asker with one push per tap. Every tap now just refreshes `lastReactedAt`;
 * the push is only sent once no further reaction has landed for this long, so
 * a burst of taps — or a tap the user immediately undoes — collapses into a
 * single notification, or none at all.
 *
 * Two minutes is long enough to swallow indecisive tapping and short enough
 * that the asker still learns about it while the question is live.
 */
export const REACTION_NOTIFY_QUIET_MS = 2 * 60 * 1000;

/** Safety valve so one flush can't fan out unboundedly. */
const FLUSH_LIMIT = 200;
const FLUSH_CHUNK = 20;

/**
 * Reaction-specific wording. "X reacted to your question" is true of all three
 * but tells the asker nothing — "has the same doubt" in particular is the one
 * reaction they may actually want to act on.
 */
const REACTION_MESSAGES: Record<string, string> = {
  like: "liked your question",
  insightful: "found your question insightful",
  same_doubt: "has the same doubt on your question",
};

const REACTION_TITLES: Record<string, string> = {
  like: "❤️ New Like",
  insightful: "💡 Marked Insightful",
  same_doubt: "🙋 Same Doubt",
};

type QueueInput = {
  questionId: string;
  askerId: string;
  reactorId: string;
  reactorName: string;
  reactionType: string;
  questionSummary: string;
};

/**
 * Record (or refresh) a pending reaction notification.
 *
 * Called on every *added* reaction. Refreshing `lastReactedAt` on an existing
 * row is what restarts the quiet window, so a user who keeps tapping keeps
 * pushing their own notification further out instead of sending another one.
 *
 * Never throws — a reaction must still succeed if the queue write fails.
 */
export async function queueReactionNotification(input: QueueInput) {
  try {
    await PendingReactionNotification.findOneAndUpdate(
      { questionId: input.questionId, reactorId: input.reactorId },
      {
        $set: {
          askerId: input.askerId,
          reactorName: input.reactorName,
          reactionType: input.reactionType,
          questionSummary: input.questionSummary,
          lastReactedAt: new Date(),
        },
      },
      { upsert: true },
    );
  } catch (err) {
    console.error("[reaction-notifications] queue failed", err);
  }
}

/**
 * Drop a pending notification because the reactor removed their reaction.
 *
 * This is the whole point of deferring: someone who taps and immediately
 * untaps generates no notification at all, rather than one the asker opens to
 * find nothing behind.
 */
export async function cancelReactionNotification(
  questionId: string,
  reactorId: string,
) {
  try {
    await PendingReactionNotification.deleteOne({ questionId, reactorId });
  } catch (err) {
    console.error("[reaction-notifications] cancel failed", err);
  }
}

export type ReactionFlushSummary = {
  dueCount: number;
  sentCount: number;
  skippedCount: number;
};

/**
 * Send every reaction notification whose reactor has gone quiet, then clear it.
 *
 * Safe to call concurrently: each row is deleted before its push is sent, so a
 * second caller that overlaps this one finds nothing left to send. The cost of
 * that ordering is that a crash mid-flush drops a notification rather than
 * duplicating it — the right trade for something a user chose to defer anyway.
 */
export async function flushDueReactionNotifications(): Promise<ReactionFlushSummary> {
  const summary: ReactionFlushSummary = {
    dueCount: 0,
    sentCount: 0,
    skippedCount: 0,
  };

  await connectToDatabase();

  const cutoff = new Date(Date.now() - REACTION_NOTIFY_QUIET_MS);
  const due = await PendingReactionNotification.find({
    lastReactedAt: { $lte: cutoff },
  })
    .limit(FLUSH_LIMIT)
    .lean<
      Array<{
        _id: unknown;
        questionId: { toString(): string };
        askerId: { toString(): string };
        reactorId: { toString(): string };
        reactorName?: string;
        reactionType: string;
        questionSummary?: string;
      }>
    >();

  summary.dueCount = due.length;
  if (due.length === 0) return summary;

  // Claim the batch up front. Whoever deletes the row owns sending it, which
  // is what stops the cron and an opportunistic flush from double-pushing when
  // they overlap.
  const claimed = await PendingReactionNotification.deleteMany({
    _id: { $in: due.map((row) => row._id) },
  });
  if (claimed.deletedCount === 0) return summary;

  // The reaction may have been removed through a path that didn't cancel the
  // row (a question deleted outright, a reaction cleared by an admin tool). A
  // notification for a reaction that no longer exists is worse than a late
  // one, so confirm it still stands before sending.
  const questionIds = [...new Set(due.map((row) => row.questionId.toString()))];
  const questions = await Question.find({ _id: { $in: questionIds } })
    .select("_id reactions")
    .lean<
      Array<{
        _id: { toString(): string };
        reactions?: Array<{ userId?: { toString(): string } | null; type?: string }>;
      }>
    >();

  const reactorsByQuestion = new Map<string, Set<string>>();
  for (const question of questions) {
    reactorsByQuestion.set(
      question._id.toString(),
      new Set(
        (question.reactions ?? [])
          .map((reaction) => reaction.userId?.toString())
          .filter((id): id is string => Boolean(id)),
      ),
    );
  }

  const sendable = due.filter((row) =>
    reactorsByQuestion
      .get(row.questionId.toString())
      ?.has(row.reactorId.toString()),
  );
  summary.skippedCount = due.length - sendable.length;

  for (let i = 0; i < sendable.length; i += FLUSH_CHUNK) {
    const results = await Promise.allSettled(
      sendable.slice(i, i + FLUSH_CHUNK).map((row) => {
        const phrase =
          REACTION_MESSAGES[row.reactionType] ?? "reacted to your question";
        const title = REACTION_TITLES[row.reactionType] ?? "New Reaction";
        const name = row.reactorName?.trim() || "Someone";
        const subject = row.questionSummary?.trim() || "your question";

        return notifyUser({
          userId: row.askerId.toString(),
          type: "REACTION_RECEIVED",
          title,
          message: `${name} ${phrase}: ${subject}`,
          href: "/feed",
          extraData: {
            questionId: row.questionId.toString(),
            reactionType: row.reactionType,
          },
        });
      }),
    );
    summary.sentCount += results.filter((r) => r.status === "fulfilled").length;
  }

  console.log(
    `[reaction-notifications] flushed ${summary.sentCount}/${summary.dueCount} due (${summary.skippedCount} withdrawn)`,
  );

  return summary;
}
