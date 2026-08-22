import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/unified-auth";
import { connectToDatabase } from "@/lib/mongodb";
import { pusherServer, emitNotification, emitQuestionUpdated } from "@/lib/pusher/pusherServer";
import { CHANNEL_CLOSED_EVENT, getChannelPusherName, getUserPusherName, CHANNEL_UPDATED_EVENT } from "@/lib/pusher/events";
import Channel from "@/models/Channel";
import Question from "@/models/Question";
import Answer from "@/models/Answer";
import User from "@/models/User";
import Notification from "@/models/Notification";
import { getPlatformConfig } from "@/models/PlatformConfig";
import { calcTeacherPayoutBreakdown } from "@/lib/points";
import { recordWalletHistoryEvent } from "@/lib/wallet-history";
import { incrementDailyTargetCount } from "@/lib/daily-targets";
import type { FeedQuestion } from "@/types/question";
import { questionSummary } from "@/lib/question-summary";

const BAYESIAN_SEED_VOTES = 5;
const BAYESIAN_SEED_SCORE = 1;
const UPDATE_PIPELINE_OPTIONS = { updatePipeline: true } as const;

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

function buildTeacherRatingUpdatePipeline({
  rating,
  pointsEarned,
  qualificationThreshold,
}: {
  rating: number;
  pointsEarned: number;
  qualificationThreshold: number;
}) {
  return [
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
  ];
}

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

type PopulatedAsker = {
  _id: { toString(): string };
  name?: string;
  username?: string;
  userImage?: string;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { rating } = await req.json();

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Valid rating (1-5) is required" }, { status: 400 });
    }

    await connectToDatabase();
    const config = await getPlatformConfig();

    const channel = await Channel.findById(id);
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    if (channel.status !== "ACTIVE") {
      return NextResponse.json({ error: "Channel is already closed or expired" }, { status: 400 });
    }

    if (channel.askerId.toString() !== user.id) {
      return NextResponse.json({ error: "Only the asker can close the channel" }, { status: 403 });
    }

    const teacher = await User.findById(channel.acceptorId);
    const answer = await Answer.findOne({ channelId: channel._id });

    if (rating === 1 && teacher) {
      channel.status = "CLOSED";
      channel.closedAt = new Date();
      channel.isClosedByAsker = true;
      channel.ratingGiven = rating;
      await channel.save();

      if (answer) {
        answer.rating = rating;
        await answer.save();
      }

      const penalty = config.penaltyPointsForLowRating || 1;
      await User.findByIdAndUpdate(
        teacher._id,
        buildTeacherPenaltyUpdatePipeline(penalty),
        UPDATE_PIPELINE_OPTIONS,
      );

      const penaltyNotif = await Notification.create({
        userId: teacher._id,
        type: "RATING_RECEIVED",
        message: `Student rated 1 star. ${penalty} point(s) deducted.`,
        href: `/workspace/${channel._id.toString()}`,
      }).catch(() => null);
      if (penaltyNotif) await emitNotification(teacher._id.toString(), penaltyNotif);

      const maxResets = config.maxQuestionResetCount || 3;
      const question = await Question.findById(channel.questionId) as PopulatedQuestion | null;

      await recordWalletHistoryEvent({
        userId: teacher._id,
        type: "LOW_RATING_PENALTY",
        title: "Low-rating penalty",
        description: question?.title
          ? `Student rated "${questionSummary(question)}" with 1/5 stars.`
          : "Student rated your solution with 1/5 stars.",
        pointsDelta: -penalty,
        metadata: {
          channelId: channel._id.toString(),
          questionId: channel.questionId.toString(),
          questionTitle: question?.title ?? null,
          rating,
          penaltyPoints: penalty,
        },
      }).catch((error) => {
        console.error("[wallet-history] Failed to record low-rating penalty", error);
      });

      // Increment daily target count even for 1-star ratings (the teacher still answered)
      await incrementDailyTargetCount(teacher._id.toString(), config).catch((err) => {
        console.error("[daily-targets] Failed to increment", err);
      });

      if (question) {
        const currentResetCount = question.resetCount || 0;

        if (currentResetCount < maxResets) {
          question.status = "RESET";
          question.acceptedById = null;
          question.acceptedAt = null;
          question.resetCount = currentResetCount + 1;
          await question.save();

          const asker = await User.findById(question.askerId) as PopulatedAsker | null;
          if (asker) {
            const reactions = Array.isArray(question.reactions) ? question.reactions : [];

            const feedQuestion: FeedQuestion = {
              id: question._id.toString(),
              channelId: channel._id.toString(),
              askerId: asker._id.toString(),
              askerName: asker.name || "Anonymous",
              askerUsername: asker.username || undefined,
              askerImage: asker.userImage || undefined,
              title: question.title,
              body: question.body,
              answerFormat: question.answerFormat,
              answerVisibility: question.answerVisibility,
              status: "RESET",
              subject: question.subject || undefined,
              stream: question.stream || undefined,
              level: question.level || undefined,
              resetCount: question.resetCount,
              reactions: reactions.map((r: { userId?: { toString(): string } | string | null; type: string }) => ({
                userId: r.userId?.toString() || "",
                type: r.type as "like" | "insightful" | "same_doubt",
              })),
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
          }

          const resetNotif = await Notification.create({
            userId: channel.askerId,
            type: "QUESTION_RESET",
            message: `Your question received a low rating and has been re-opened for other teachers. (${(question.resetCount)}/${maxResets} attempts)`,
            href: `/question/${question._id.toString()}`,
          }).catch(() => null);
          if (resetNotif) await emitNotification(channel.askerId.toString(), resetNotif);
        } else {
          question.status = "SOLVED";
          if (answer && answer.isPublic) {
            question.answerId = answer._id;
          }
          await question.save();

          const maxReachedNotif = await Notification.create({
            userId: channel.askerId,
            type: "CHANNEL_CLOSED",
            message: `Question auto-marked as solved after ${maxResets} attempts.`,
            href: `/question/${question._id.toString()}`,
          }).catch(() => null);
          if (maxReachedNotif) await emitNotification(channel.askerId.toString(), maxReachedNotif);
        }
      }

      if (pusherServer) {
        await pusherServer.trigger(
          getChannelPusherName(channel._id.toString()),
          CHANNEL_CLOSED_EVENT,
          { status: "CLOSED", ratingGiven: rating }
        );
        await pusherServer.trigger(
          getUserPusherName(channel.acceptorId.toString()),
          CHANNEL_UPDATED_EVENT,
          { channelId: channel._id.toString() }
        );
      }

      return NextResponse.json({ 
        success: true, 
        channel,
        questionReset: question ? (question.resetCount || 0) < maxResets : false
      });
    }

    channel.status = "CLOSED";
    channel.closedAt = new Date();
    channel.isClosedByAsker = true;
    channel.ratingGiven = rating;
    await channel.save();

    const question = await Question.findById(channel.questionId);
    if (question) {
      question.status = "SOLVED";

      if (answer) {
        answer.rating = rating;
        await answer.save();

        if (answer.isPublic) {
          question.answerId = answer._id;
        }
      }
      await question.save();
    }

    if (teacher) {
      const payout =
        teacher.isMonetized && answer
          ? calcTeacherPayoutBreakdown(rating, config)
          : null;
      const pointsEarned = payout?.finalPoints ?? 0;

      await User.findByIdAndUpdate(
        teacher._id,
        buildTeacherRatingUpdatePipeline({
          rating,
          pointsEarned,
          qualificationThreshold: config.qualificationThreshold,
        }),
        UPDATE_PIPELINE_OPTIONS,
      );

      if (pointsEarned > 0) {
        await recordWalletHistoryEvent({
          userId: teacher._id,
          type: "ANSWER_REWARD",
          title: "Answer reward",
          description: question?.title
            ? `Student rated "${questionSummary(question)}" with ${rating}/5 stars.`
            : `Student rated your solution ${rating}/5 stars.`,
          pointsDelta: pointsEarned,
            metadata: {
              channelId: channel._id.toString(),
              questionId: channel.questionId.toString(),
              questionTitle: question?.title ?? null,
              rating,
              answerFormat: answer?.answerFormat ?? null,
              ratingPoints: payout?.ratingPoints ?? 0,
              bonusPoints: payout?.bonusPoints ?? 0,
              grossPoints: payout?.grossPoints ?? pointsEarned,
              commissionPercent: payout?.commissionPercent ?? 0,
              commissionPoints: payout?.commissionPoints ?? 0,
              finalPoints: payout?.finalPoints ?? pointsEarned,
            },
          }).catch((error) => {
            console.error("[wallet-history] Failed to record answer reward", error);
          });
      }

      // Increment daily target count for the teacher (awards bonuses if thresholds met)
      await incrementDailyTargetCount(teacher._id.toString(), config).catch((err) => {
        console.error("[daily-targets] Failed to increment", err);
      });

      const notifMessage = teacher.isMonetized && answer
        ? `Student rated your solution ${rating}/5 stars. Points credited!`
        : `Student rated your solution ${rating}/5 stars.`;

      const notif = await Notification.create({
        userId: teacher._id,
        type: "RATING_RECEIVED",
        message: notifMessage,
        href: `/workspace/${channel._id.toString()}`,
      }).catch(() => null);
      if (notif) await emitNotification(teacher._id.toString(), notif);
    }

    if (pusherServer) {
      await pusherServer.trigger(
        getChannelPusherName(channel._id.toString()),
        CHANNEL_CLOSED_EVENT,
        {
          status: "CLOSED",
          ratingGiven: rating,
        }
      );
      
      await pusherServer.trigger(
        getUserPusherName(channel.acceptorId.toString()),
        CHANNEL_UPDATED_EVENT,
        {
          channelId: channel._id.toString(),
        }
      );
    }

    return NextResponse.json({ success: true, channel });
  } catch (error) {
    console.error("[POST /api/channels/close]", error);
    return NextResponse.json(
      { error: "Failed to close channel" },
      { status: 500 }
    );
  }
}
