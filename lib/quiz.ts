import "server-only";

import { Types } from "mongoose";

import { SUBSCRIPTION_PLANS } from "@/lib/plans";
import { roundPoints } from "@/lib/points";
import { connectToDatabase } from "@/lib/mongodb";
import { getPlatformConfig } from "@/models/PlatformConfig";
import QuizQuestion from "@/models/QuizQuestion";
import QuizSession from "@/models/QuizSession";
import Transaction from "@/models/Transaction";
import User from "@/models/User";
import type {
  QuizActiveSessionSummary,
  QuizHistoryResponse,
  QuizSessionResponse,
  QuizSubmitReason,
  QuizType,
} from "@/types/quiz";

const PAID_PLAN_SLUGS = new Set(["go", "plus", "pro", "max"]);
const NEPAL_OFFSET_MINUTES = 5 * 60 + 45;
const DAY_MS = 24 * 60 * 60 * 1000;

type SubscriptionSnapshot = {
  planSlug: string | null;
  subscriptionStatus: "ACTIVE" | "EXPIRED" | "NONE";
  subscriptionEnd: string | null;
  isPremiumEligible: boolean;
};

type QuizModeSettings = {
  dailyLimit: number;
  passPercent: number;
  pointReward: number;
};

type QuizAnswerOverride = {
  questionId: string;
  selectedOptionIndex: number | null;
};

function toObjectId(value: string) {
  return new Types.ObjectId(value);
}

function toDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getQuestionOrderIds(session: {
  questionsAsked: Array<{ toString(): string } | string>;
}) {
  return session.questionsAsked.map((item) =>
    typeof item === "string" ? item : item.toString(),
  );
}

function getAnswerMap(session: {
  answers?: Array<{
    questionId: { toString(): string } | string;
    selectedOptionIndex?: number | null;
    isCorrect?: boolean;
  }>;
}) {
  return new Map(
    (session.answers ?? []).map((answer) => [
      typeof answer.questionId === "string"
        ? answer.questionId
        : answer.questionId.toString(),
      {
        selectedOptionIndex:
          answer.selectedOptionIndex === undefined ? null : answer.selectedOptionIndex,
        isCorrect: answer.isCorrect ?? false,
      },
    ]),
  );
}

function countAnsweredQuestions(session: {
  answers?: Array<{ selectedOptionIndex?: number | null }>;
}) {
  return (session.answers ?? []).filter(
    (answer) => answer.selectedOptionIndex !== null && answer.selectedOptionIndex !== undefined,
  ).length;
}

export function getNepalDayBounds(reference = new Date()) {
  const offsetMs = NEPAL_OFFSET_MINUTES * 60 * 1000;
  const shifted = new Date(reference.getTime() + offsetMs);
  shifted.setUTCHours(0, 0, 0, 0);

  const start = new Date(shifted.getTime() - offsetMs);
  const end = new Date(start.getTime() + DAY_MS);

  return { start, end };
}

export function getQuizModeSettings(
  config: Awaited<ReturnType<typeof getPlatformConfig>>,
  quizType: QuizType,
  planSlug?: string | null,
): QuizModeSettings {
  if (quizType === "FREE") {
    return {
      dailyLimit: config.freeQuizDailySessionLimit,
      passPercent: config.freeQuizPassPercent,
      pointReward: config.freeQuizPointReward,
    };
  }

  const premiumDailyLimitByPlan: Record<string, number | undefined> = {
    go: config.premiumQuizDailySessionLimitGo,
    plus: config.premiumQuizDailySessionLimitPlus,
    pro: config.premiumQuizDailySessionLimitPro,
    max: config.premiumQuizDailySessionLimitMax,
  };
  const premiumDailyLimit =
    (planSlug ? premiumDailyLimitByPlan[planSlug] : undefined) ??
    config.premiumQuizDailySessionLimit;

  return {
    dailyLimit: premiumDailyLimit,
    passPercent: config.premiumQuizPassPercent,
    pointReward: config.premiumQuizPointReward,
  };
}

export async function getQuizSubscriptionSnapshot(userId: string): Promise<SubscriptionSnapshot> {
  await connectToDatabase();

  const latestCompletedTransaction = await Transaction.findOne({
    userId,
    type: "SUBSCRIPTION_MANUAL",
    status: "COMPLETED",
  }).sort({ updatedAt: -1, createdAt: -1 });

  if (!latestCompletedTransaction?.planSlug) {
    return {
      planSlug: null,
      subscriptionStatus: "NONE",
      subscriptionEnd: null,
      isPremiumEligible: false,
    };
  }

  const plan = SUBSCRIPTION_PLANS.find(
    (entry) => entry.slug === latestCompletedTransaction.planSlug,
  );

  if (!plan) {
    return {
      planSlug: latestCompletedTransaction.planSlug,
      subscriptionStatus: "NONE",
      subscriptionEnd: null,
      isPremiumEligible: false,
    };
  }

  const startedAt = new Date(latestCompletedTransaction.updatedAt);
  const subscriptionEnd = new Date(
    startedAt.getTime() + plan.durationDays * DAY_MS,
  );
  const subscriptionStatus =
    subscriptionEnd.getTime() > Date.now() ? "ACTIVE" : "EXPIRED";

  return {
    planSlug: plan.slug,
    subscriptionStatus,
    subscriptionEnd: subscriptionEnd.toISOString(),
    isPremiumEligible:
      subscriptionStatus === "ACTIVE" && PAID_PLAN_SLUGS.has(plan.slug),
  };
}

export async function getQuizQuestionDocsForSession(session: {
  questionsAsked: Array<{ toString(): string } | string>;
}) {
  await connectToDatabase();

  const orderedIds = getQuestionOrderIds(session);
  const questions = await QuizQuestion.find({
    _id: { $in: orderedIds.map((id) => toObjectId(id)) },
  }).lean();

  const questionMap = new Map(
    questions.map((question) => [question._id.toString(), question]),
  );

  return orderedIds
    .map((id) => questionMap.get(id))
    .filter((question): question is NonNullable<typeof question> => Boolean(question));
}

export function buildQuizSessionResponse(
  session: {
    _id: { toString(): string } | string;
    quizType: QuizType;
    status: "IN_PROGRESS" | "SUBMITTED";
    subject: string;
    topic: string;
    level: string;
    startedAt: Date | string;
    timerDeadline: Date | string;
    submittedAt?: Date | string | null;
    score?: number;
    pointsAwarded?: number;
    submitReason?: QuizSubmitReason | null;
    violationCount?: number;
    configSnapshot: {
      questionCount: number;
      passPercent: number;
      pointReward: number;
      violationWarningLimit: number;
    };
    questionsAsked: Array<{ toString(): string } | string>;
    answers?: Array<{
      questionId: { toString(): string } | string;
      selectedOptionIndex?: number | null;
      isCorrect?: boolean;
    }>;
  },
  questions: Array<{
    _id: { toString(): string } | string;
    questionText: string;
    options: string[];
    explanation?: string | null;
    correctOptionIndex: number;
  }>,
): QuizSessionResponse {
  const includeSolutions = session.status === "SUBMITTED";
  const answerMap = getAnswerMap(session);

  return {
    id: typeof session._id === "string" ? session._id : session._id.toString(),
    quizType: session.quizType,
    status: session.status,
    subject: session.subject,
    topic: session.topic,
    level: session.level,
    startedAt: new Date(session.startedAt).toISOString(),
    timerDeadline: new Date(session.timerDeadline).toISOString(),
    submittedAt: session.submittedAt ? new Date(session.submittedAt).toISOString() : null,
    score: roundPoints(session.score ?? 0),
    pointsAwarded: roundPoints(session.pointsAwarded ?? 0),
    submitReason: session.submitReason ?? null,
    violationCount: session.violationCount ?? 0,
    warningLimit: session.configSnapshot.violationWarningLimit,
    passPercent: session.configSnapshot.passPercent,
    pointReward: roundPoints(session.configSnapshot.pointReward),
    questionCount: session.configSnapshot.questionCount,
    answeredCount: countAnsweredQuestions(session),
    questions: questions.map((question) => {
      const questionId =
        typeof question._id === "string" ? question._id : question._id.toString();
      const answer = answerMap.get(questionId);

      return {
        id: questionId,
        questionText: question.questionText,
        options: question.options,
        explanation: includeSolutions ? question.explanation ?? null : undefined,
        correctOptionIndex: includeSolutions ? question.correctOptionIndex : undefined,
        selectedOptionIndex: answer?.selectedOptionIndex ?? null,
        isCorrect: includeSolutions ? answer?.isCorrect ?? false : undefined,
      };
    }),
  };
}

export async function finalizeQuizSession(input: {
  sessionId: string;
  studentId: string;
  submitReason: QuizSubmitReason;
  answers?: QuizAnswerOverride[];
}) {
  await connectToDatabase();

  const session = await QuizSession.findOne({
    _id: input.sessionId,
    studentId: input.studentId,
  }).lean();

  if (!session) {
    return null;
  }

  if (session.status !== "IN_PROGRESS") {
    return session;
  }

  const questions = await getQuizQuestionDocsForSession(session);
  const answerMap = getAnswerMap(session);

  for (const answer of input.answers ?? []) {
    answerMap.set(answer.questionId, {
      selectedOptionIndex:
        answer.selectedOptionIndex === undefined ? null : answer.selectedOptionIndex,
      isCorrect: false,
    });
  }

  let correctCount = 0;
  const finalizedAnswers = questions.map((question) => {
    const questionId = question._id.toString();
    const existing = answerMap.get(questionId);
    const selectedOptionIndex =
      existing?.selectedOptionIndex === undefined ? null : existing.selectedOptionIndex;
    const isCorrect =
      selectedOptionIndex !== null &&
      selectedOptionIndex !== undefined &&
      selectedOptionIndex === question.correctOptionIndex;

    if (isCorrect) {
      correctCount += 1;
    }

    return {
      questionId: question._id,
      selectedOptionIndex,
      isCorrect,
    };
  });

  const totalQuestions =
    session.configSnapshot.questionCount || questions.length || 1;
  const score = roundPoints((correctCount / totalQuestions) * 100);
  const pointsAwarded =
    score >= session.configSnapshot.passPercent
      ? roundPoints(session.configSnapshot.pointReward)
      : 0;
  const submittedAt = new Date();

  const updatedSession = await QuizSession.findOneAndUpdate(
    {
      _id: input.sessionId,
      studentId: input.studentId,
      status: "IN_PROGRESS",
    },
    {
      $set: {
        answers: finalizedAnswers,
        score,
        pointsAwarded,
        status: "SUBMITTED",
        submittedAt,
        submitReason: input.submitReason,
        lastHeartbeatAt: submittedAt,
      },
    },
    { new: true },
  );

  if (!updatedSession) {
    return QuizSession.findOne({
      _id: input.sessionId,
      studentId: input.studentId,
    }).lean();
  }

  if (pointsAwarded > 0) {
    const student = await User.findById(input.studentId).select("points");

    if (student) {
      student.points = roundPoints((student.points ?? 0) + pointsAwarded);
      await student.save();
    }
  }

  await QuizQuestion.updateMany(
    { _id: { $in: updatedSession.questionsAsked } },
    { $inc: { usageCount: 1 } },
  );

  return updatedSession.toObject();
}

export async function getSyncedQuizSession(sessionId: string, studentId: string) {
  if (!Types.ObjectId.isValid(sessionId)) return null;
  await connectToDatabase();

  let session = await QuizSession.findOne({
    _id: sessionId,
    studentId,
  }).lean();

  if (!session) {
    return null;
  }

  const deadline = toDate(session.timerDeadline);
  if (
    session.status === "IN_PROGRESS" &&
    deadline &&
    deadline.getTime() <= Date.now()
  ) {
    await finalizeQuizSession({
      sessionId,
      studentId,
      submitReason: "TIME_EXPIRED",
    });

    session = await QuizSession.findOne({
      _id: sessionId,
      studentId,
    }).lean();
  }

  return session;
}

function buildActiveSessionSummary(session: {
  _id: { toString(): string } | string;
  quizType: QuizType;
  subject: string;
  topic: string;
  level: string;
  startedAt: Date | string;
  timerDeadline: Date | string;
}): QuizActiveSessionSummary {
  return {
    id: typeof session._id === "string" ? session._id : session._id.toString(),
    quizType: session.quizType,
    subject: session.subject,
    topic: session.topic,
    level: session.level,
    startedAt: new Date(session.startedAt).toISOString(),
    timerDeadline: new Date(session.timerDeadline).toISOString(),
  };
}

export async function getQuizHistorySummary(
  studentId: string,
  page = 1,
  limit = 10,
): Promise<QuizHistoryResponse> {
  await connectToDatabase();

  const config = await getPlatformConfig();
  const subscription = await getQuizSubscriptionSnapshot(studentId);

  let activeSession = await QuizSession.findOne({
    studentId,
    status: "IN_PROGRESS",
  })
    .sort({ startedAt: -1 })
    .lean();

  const activeDeadline = toDate(activeSession?.timerDeadline);
  if (
    activeSession &&
    activeDeadline &&
    activeDeadline.getTime() <= Date.now()
  ) {
    await finalizeQuizSession({
      sessionId: activeSession._id.toString(),
      studentId,
      submitReason: "TIME_EXPIRED",
    });
    activeSession = null;
  }

  const { start, end } = getNepalDayBounds();
  const todayCounts = await QuizSession.aggregate<{ _id: QuizType; count: number }>([
    {
      $match: {
        studentId: toObjectId(studentId),
        startedAt: { $gte: start, $lt: end },
      },
    },
    {
      $group: {
        _id: "$quizType",
        count: { $sum: 1 },
      },
    },
  ]);

  const freeUsedToday = todayCounts.find((entry) => entry._id === "FREE")?.count ?? 0;
  const premiumUsedToday =
    todayCounts.find((entry) => entry._id === "PREMIUM")?.count ?? 0;

  const skip = Math.max(0, (page - 1) * limit);
  const [items, total] = await Promise.all([
    QuizSession.find({ studentId })
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    QuizSession.countDocuments({ studentId }),
  ]);

  const freeSettings = getQuizModeSettings(config, "FREE");
  const premiumSettings = getQuizModeSettings(
    config,
    "PREMIUM",
    subscription.planSlug,
  );

  return {
    items: items.map((item) => ({
      id: item._id.toString(),
      quizType: item.quizType,
      status: item.status,
      subject: item.subject,
      topic: item.topic,
      level: item.level,
      score: roundPoints(item.score ?? 0),
      pointsAwarded: roundPoints(item.pointsAwarded ?? 0),
      answeredCount: countAnsweredQuestions(item),
      questionCount: item.configSnapshot.questionCount,
      violationCount: item.violationCount ?? 0,
      submitReason: item.submitReason ?? null,
      startedAt: new Date(item.startedAt).toISOString(),
      submittedAt: item.submittedAt ? new Date(item.submittedAt).toISOString() : null,
    })),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    activeSession:
      activeSession && activeSession.status === "IN_PROGRESS"
        ? buildActiveSessionSummary(activeSession)
        : null,
    free: {
      dailyLimit: freeSettings.dailyLimit,
      usedToday: freeUsedToday,
      remainingToday: Math.max(0, freeSettings.dailyLimit - freeUsedToday),
      passPercent: freeSettings.passPercent,
      pointReward: roundPoints(freeSettings.pointReward),
      isEligible: true,
      reason: null,
    },
    premium: {
      dailyLimit: premiumSettings.dailyLimit,
      usedToday: premiumUsedToday,
      remainingToday: Math.max(0, premiumSettings.dailyLimit - premiumUsedToday),
      passPercent: premiumSettings.passPercent,
      pointReward: roundPoints(premiumSettings.pointReward),
      isEligible: subscription.isPremiumEligible,
      reason: subscription.isPremiumEligible
        ? null
        : "An active paid plan is required for premium quiz mode.",
    },
    planSlug: subscription.planSlug,
    subscriptionStatus: subscription.subscriptionStatus,
  };
}

export async function getActiveQuizSessionForStudent(studentId: string) {
  await connectToDatabase();

  let activeSession = await QuizSession.findOne({
    studentId,
    status: "IN_PROGRESS",
  })
    .sort({ startedAt: -1 })
    .lean();

  const deadline = toDate(activeSession?.timerDeadline);
  if (
    activeSession &&
    deadline &&
    deadline.getTime() <= Date.now()
  ) {
    await finalizeQuizSession({
      sessionId: activeSession._id.toString(),
      studentId,
      submitReason: "TIME_EXPIRED",
    });

    activeSession = await QuizSession.findOne({
      studentId,
      status: "IN_PROGRESS",
    })
      .sort({ startedAt: -1 })
      .lean();
  }

  return activeSession;
}
