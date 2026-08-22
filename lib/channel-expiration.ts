import { calcTeacherPayoutBreakdown } from "@/lib/points";
import { connectToDatabase } from "@/lib/mongodb";
import {
  emitQuestionUpdated,
  emitChannelStatusUpdate,
  emitNotification,
} from "@/lib/pusher/pusherServer";
import Answer from "@/models/Answer";
import Channel from "@/models/Channel";
import Notification from "@/models/Notification";
import { getPlatformConfig } from "@/models/PlatformConfig";
import User from "@/models/User";
import { recordWalletHistoryEvent } from "@/lib/wallet-history";
import { incrementDailyTargetCount } from "@/lib/daily-targets";
import type { FeedQuestion } from "@/types/question";
import Question from "@/models/Question";
import { questionSummary } from "@/lib/question-summary";

const BAYESIAN_SEED_VOTES = 5;
const BAYESIAN_SEED_SCORE = 1;
export const AUTO_CLOSE_RATING = 3;
export const AUTO_CLOSE_GRACE_PERIOD_MS = 30 * 60 * 1000;
const UPDATE_PIPELINE_OPTIONS = { updatePipeline: true } as const;

type PopulatedUserRef = {
  _id?: { toString(): string } | string | null;
  toString?: () => string;
  name?: string;
  username?: string;
  userImage?: string;
};

type RefLike = PopulatedUserRef | { toString(): string } | string | null | undefined;

type PopulatedQuestion = {
  _id: { toString(): string };
  askerId?: { toString(): string } | string | null;
  title: string;
  body: string;
  answerFormat: FeedQuestion["answerFormat"];
  answerVisibility: FeedQuestion["answerVisibility"];
  subject?: string;
  stream?: string;
  level?: string;
  resetCount: number;
  reactions?: Array<{
    userId?: { toString(): string } | string | null;
    type: string;
  }>;
  acceptedById?: { toString(): string } | string | null;
  acceptedAt?: Date | null;
  answerId?: { toString(): string } | string | null;
  createdAt: Date;
  updatedAt: Date;
  status: FeedQuestion["status"];
  save: () => Promise<unknown>;
};

export type ChannelExpirationSummary = {
  processedCount: number;
  expiredCount: number;
  autoClosedCount: number;
  processedChannelIds: string[];
  expiredChannelIds: string[];
  autoClosedChannelIds: string[];
};

type ProcessExpiredChannelsOptions = {
  channelId?: string;
  now?: Date;
};

function getRefId(value: RefLike) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if ("_id" in value && value._id) {
    return value._id.toString();
  }
  if (typeof value.toString === "function") {
    return value.toString();
  }
  return "";
}

function getUserSnapshot(value: RefLike) {
  if (!value || typeof value === "string") {
    return {
      name: undefined,
      username: undefined,
      userImage: undefined,
    };
  }

  return {
    name: "name" in value ? value.name : undefined,
    username: "username" in value ? value.username : undefined,
    userImage: "userImage" in value ? value.userImage : undefined,
  };
}

function buildTeacherPenaltyUpdatePipeline(penalty: number) {
  return [
    {
      $set: {
        pointBalance: {
          $max: [
            0,
            {
              $subtract: [{ $ifNull: ["$pointBalance", 0] }, penalty],
            },
          ],
        },
        totalPenaltyPoints: {
          $add: [{ $ifNull: ["$totalPenaltyPoints", 0] }, penalty],
        },
      },
    },
  ];
}

async function applyBayesianRating({
  teacherId,
  rating,
  pointsEarned,
  qualificationThreshold,
}: {
  teacherId: string;
  rating: number;
  pointsEarned: number;
  qualificationThreshold: number;
}) {
  await User.findByIdAndUpdate(
    teacherId,
    [
      {
        $set: {
          overallRatingSum: {
            $add: [{ $ifNull: ["$overallRatingSum", 0] }, rating],
          },
          overallRatingCount: {
            $add: [{ $ifNull: ["$overallRatingCount", 0] }, 1],
          },
          ...(pointsEarned > 0
            ? {
                pointBalance: {
                  $add: [{ $ifNull: ["$pointBalance", 0] }, pointsEarned],
                },
                totalPointsEarned: {
                  $add: [{ $ifNull: ["$totalPointsEarned", 0] }, pointsEarned],
                },
              }
            : {}),
          teacherModeVerified: {
            $or: [
              { $ifNull: ["$teacherModeVerified", false] },
              {
                $gte: [{ $ifNull: ["$totalAnswered", 0] }, qualificationThreshold],
              },
            ],
          },
        },
      },
      {
        $set: {
          overallScore: {
            $divide: [
              {
                $add: [
                  BAYESIAN_SEED_SCORE * BAYESIAN_SEED_VOTES,
                  "$overallRatingSum",
                ],
              },
              {
                $add: [BAYESIAN_SEED_VOTES, "$overallRatingCount"],
              },
            ],
          },
        },
      },
    ],
    UPDATE_PIPELINE_OPTIONS,
  );
}

export async function processExpiredChannels(
  options: ProcessExpiredChannelsOptions = {},
): Promise<ChannelExpirationSummary> {
  const now = options.now ?? new Date();
  const autoCloseGraceThreshold = new Date(
    now.getTime() - AUTO_CLOSE_GRACE_PERIOD_MS,
  );

  await connectToDatabase();
  const config = await getPlatformConfig();

  const filters: Record<string, unknown> = {
    status: "ACTIVE",
    timerDeadline: { $lte: now },
  };

  if (options.channelId) {
    filters._id = options.channelId;
  }

  const overdueChannels = await Channel.find(filters)
    .populate("questionId")
    .populate("askerId", "name username userImage")
    .populate("acceptorId", "name username overallScore totalAnswered");

  const summary: ChannelExpirationSummary = {
    processedCount: 0,
    expiredCount: 0,
    autoClosedCount: 0,
    processedChannelIds: [],
    expiredChannelIds: [],
    autoClosedChannelIds: [],
  };

  // Cleanup orphaned questions (stuck in ACCEPTED for > 24 hours)
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const orphanedQuestions = await Question.find({
    status: "ACCEPTED",
    acceptedAt: { $lte: oneDayAgo }
  });

  for (const q of orphanedQuestions) {
    q.status = "RESET";
    q.acceptedById = null;
    q.acceptedAt = null;
    q.resetCount = (q.resetCount || 0) + 1;
    await q.save();
    console.log(`[cron] Reset orphaned question: ${q._id}`);
  }

  for (const channel of overdueChannels) {
    const channelId = channel._id.toString();
    const existingAnswer = await Answer.findOne({ channelId: channel._id });

    if (existingAnswer) {
      const deadlinePassedGrace =
        new Date(channel.timerDeadline).getTime() <=
        autoCloseGraceThreshold.getTime();

      if (!deadlinePassedGrace) {
        continue;
      }

      channel.status = "CLOSED";
      channel.closedAt = now;
      channel.isClosedByAsker = false;
      channel.ratingGiven = AUTO_CLOSE_RATING;
      await channel.save();

      existingAnswer.rating = AUTO_CLOSE_RATING;
      await existingAnswer.save();

      const question = channel.questionId as PopulatedQuestion | null;
      if (question) {
        question.status = "SOLVED";
        if (existingAnswer.isPublic) {
          question.answerId = existingAnswer._id;
        }
        await question.save();

        await emitQuestionUpdated({
          id: question._id.toString(),
          channelId,
          askerId: question.askerId?.toString() || "",
          askerName: "",
          title: question.title,
          body: question.body,
          answerFormat: question.answerFormat,
          answerVisibility: question.answerVisibility,
          status: "SOLVED",
          subject: question.subject || undefined,
          stream: question.stream || undefined,
          level: question.level || undefined,
          resetCount: question.resetCount,
          reactions: [],
          acceptedById: null,
          acceptedAt: null,
          acceptedByName: null,
          answerCount: 1,
          reactionCount: 0,
          commentCount: 0,
          createdAt: new Date(question.createdAt).toISOString(),
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      }

      const teacherId = getRefId(channel.acceptorId as RefLike);
      if (teacherId) {
        const teacher = await User.findById(teacherId)
          .select("_id isMonetized")
          .lean();
        const payout =
          teacher?.isMonetized && existingAnswer
            ? calcTeacherPayoutBreakdown(AUTO_CLOSE_RATING, config)
            : null;
        const pointsEarned = payout?.finalPoints ?? 0;

        await applyBayesianRating({
          teacherId,
          rating: AUTO_CLOSE_RATING,
          pointsEarned,
          qualificationThreshold: config.qualificationThreshold,
        });

        if (pointsEarned > 0) {
          await recordWalletHistoryEvent({
            userId: teacherId,
            type: "AUTO_CLOSE_REWARD",
            title: "Auto-close reward",
            description: question?.title
              ? `Auto-rated ${AUTO_CLOSE_RATING}/5 for "${questionSummary(question)}" after the asker did not respond.`
              : `Auto-rated ${AUTO_CLOSE_RATING}/5 after the asker did not respond.`,
            pointsDelta: pointsEarned,
            metadata: {
              channelId,
              questionId: question?._id?.toString() ?? null,
              questionTitle: question?.title ?? null,
              rating: AUTO_CLOSE_RATING,
              answerFormat: existingAnswer.answerFormat,
              ratingPoints: payout?.ratingPoints ?? 0,
              bonusPoints: payout?.bonusPoints ?? 0,
              grossPoints: payout?.grossPoints ?? pointsEarned,
              commissionPercent: payout?.commissionPercent ?? 0,
              commissionPoints: payout?.commissionPoints ?? 0,
              finalPoints: payout?.finalPoints ?? pointsEarned,
            },
          }).catch((error) => {
            console.error("[wallet-history] Failed to record auto-close reward", error);
          });
        }

        const teacherNotif = await Notification.create({
          userId: teacherId,
          type: "RATING_RECEIVED",
          message:
            pointsEarned > 0
              ? `Auto-reviewed: You received ${AUTO_CLOSE_RATING}/5 stars (asker didn't rate in time). Points credited automatically.`
              : `Auto-reviewed: You received ${AUTO_CLOSE_RATING}/5 stars (asker didn't rate in time).`,
          href: `/workspace/${channelId}`,
        }).catch(() => null);

        if (teacherNotif) {
          await emitNotification(teacherId, teacherNotif).catch(() => {});
        }

        // Increment daily target count for the auto-closed teacher
        await incrementDailyTargetCount(teacherId, config).catch((err) => {
          console.error("[daily-targets] Failed to increment on auto-close", err);
        });
      }

      const askerId = getRefId(channel.askerId as RefLike);
      if (askerId) {
        const askerNotif = await Notification.create({
          userId: askerId,
          type: "CHANNEL_CLOSED",
          message: `Your channel was auto-closed. The teacher's answer was rated ${AUTO_CLOSE_RATING}/5 automatically.`,
          href: question ? `/question/${question._id.toString()}` : "/",
        }).catch(() => null);

        if (askerNotif) {
          await emitNotification(askerId, askerNotif).catch(() => {});
        }
      }

      await emitChannelStatusUpdate(channelId, "CLOSED", {
        ratingGiven: AUTO_CLOSE_RATING,
      }).catch(() => {});

      summary.processedCount++;
      summary.autoClosedCount++;
      summary.processedChannelIds.push(channelId);
      summary.autoClosedChannelIds.push(channelId);
      continue;
    }

    channel.status = "EXPIRED";
    channel.closedAt = now;
    channel.ratingGiven = 1;
    await channel.save();

    const teacherId = getRefId(channel.acceptorId as RefLike);
    const penalty = config.scoreDeductionAmount || 1;

    if (teacherId) {
      await User.findByIdAndUpdate(
        teacherId,
        buildTeacherPenaltyUpdatePipeline(penalty),
        UPDATE_PIPELINE_OPTIONS,
      );

      const penaltyNotif = await Notification.create({
        userId: teacherId,
        type: "QUESTION_RESET",
        message: `You did not submit an answer in time. ${penalty} point(s) deducted.`,
        href: `/workspace/${channelId}`,
      }).catch(() => null);

      if (penaltyNotif) {
        await emitNotification(teacherId, penaltyNotif).catch(() => {});
      }
    }

    const question = channel.questionId as PopulatedQuestion | null;
    const askerId = getRefId(channel.askerId as RefLike);
    const askerSnapshot = getUserSnapshot(channel.askerId as RefLike);

    if (teacherId) {
      await recordWalletHistoryEvent({
        userId: teacherId,
        type: "TIMEOUT_PENALTY",
        title: "Timeout penalty",
        description: question?.title
          ? `You did not answer "${questionSummary(question)}" before the deadline.`
          : "You did not submit an answer before the deadline.",
        pointsDelta: -penalty,
        metadata: {
          channelId,
          questionId: question?._id?.toString() ?? null,
          questionTitle: question?.title ?? null,
          penaltyPoints: penalty,
        },
      }).catch((error) => {
        console.error("[wallet-history] Failed to record timeout penalty", error);
      });
    }

    if (question) {
      const currentResetCount = question.resetCount || 0;
      const maxResets = config.maxQuestionResetCount || 3;

      if (currentResetCount < maxResets) {
        question.status = "RESET";
        question.acceptedById = null;
        question.acceptedAt = null;
        question.resetCount = currentResetCount + 1;
        await question.save();

        const reactions = Array.isArray(question.reactions)
          ? question.reactions
          : [];

        const feedQuestion: FeedQuestion = {
          id: question._id.toString(),
          channelId,
          askerId,
          askerName: askerSnapshot.name || "Anonymous",
          askerUsername: askerSnapshot.username || undefined,
          askerImage: askerSnapshot.userImage || undefined,
          title: question.title,
          body: question.body,
          answerFormat: question.answerFormat,
          answerVisibility: question.answerVisibility,
          status: "RESET",
          subject: question.subject || undefined,
          stream: question.stream || undefined,
          level: question.level || undefined,
          resetCount: question.resetCount,
          reactions: reactions.map(
            (reaction: {
              userId?: { toString(): string } | string | null;
              type: string;
            }) => ({
              userId: reaction.userId?.toString() || "",
              type: reaction.type as "like" | "insightful" | "same_doubt",
            }),
          ),
          acceptedById: null,
          acceptedAt: null,
          acceptedByName: null,
          answerCount: 0,
          reactionCount: reactions.length,
          commentCount: 0,
          createdAt: new Date(question.createdAt).toISOString(),
          updatedAt: new Date(question.updatedAt).toISOString(),
        };

        await emitQuestionUpdated(feedQuestion).catch(() => {});

        if (askerId) {
          const reopenNotif = await Notification.create({
            userId: askerId,
            type: "QUESTION_RESET",
            message: `Teacher didn't answer in time. Your question has been re-opened. (${question.resetCount}/${maxResets} attempts)`,
            href: `/question/${question._id.toString()}`,
          }).catch(() => null);

          if (reopenNotif) {
            await emitNotification(askerId, reopenNotif).catch(() => {});
          }
        }
      } else {
        question.status = "SOLVED";
        question.acceptedById = null;
        question.acceptedAt = null;
        await question.save();

        if (askerId) {
          const maxReachedNotif = await Notification.create({
            userId: askerId,
            type: "CHANNEL_EXPIRED",
            message: `Question auto-marked as solved after ${maxResets} attempts.`,
            href: `/question/${question._id.toString()}`,
          }).catch(() => null);

          if (maxReachedNotif) {
            await emitNotification(askerId, maxReachedNotif).catch(() => {});
          }
        }
      }
    }

    await emitChannelStatusUpdate(channelId, "EXPIRED").catch(() => {});

    summary.processedCount++;
    summary.expiredCount++;
    summary.processedChannelIds.push(channelId);
    summary.expiredChannelIds.push(channelId);
  }

  return summary;
}
