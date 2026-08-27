import "server-only";

import PeerComment from "@/models/PeerComment";

/**
 * The `answerCount` / `commentCount` a question broadcast must carry.
 *
 * Every `emitQuestionUpdated` payload used to hardcode both to `0`, because the
 * counts are not on the Question document and each call site would have had to
 * query for them. The mobile feed merges those broadcasts over the card it
 * already has, so reacting to a question with three peer comments reset its
 * comment count to zero on every client until the next refetch — the same class
 * of bug as the blanked `images`.
 *
 * Reading the counts from one place keeps them in step with
 * `GET /api/questions/feed`, which is the definition every client is comparing
 * against. If the feed's definition changes, it changes here too.
 */

/**
 * A question has an answer when a public answer has been linked to it. Mirrors
 * the feed's `linkedAnswer ? 1 : 0` — a private answer is deliberately not
 * counted, since the feed can't show it.
 */
export function getQuestionAnswerCount(question: {
  answerId?: unknown;
}): number {
  return question.answerId ? 1 : 0;
}

/** Peer comments on a question. Never throws — falls back to 0. */
export async function getQuestionCommentCount(
  questionId: unknown,
): Promise<number> {
  return PeerComment.countDocuments({ questionId }).catch((err) => {
    console.error("[question-counts] comment count failed", err);
    return 0;
  });
}

/** Both counts for a single question, in one call. */
export async function getQuestionCounts(question: {
  _id: unknown;
  answerId?: unknown;
}): Promise<{ answerCount: number; commentCount: number }> {
  return {
    answerCount: getQuestionAnswerCount(question),
    commentCount: await getQuestionCommentCount(question._id),
  };
}
