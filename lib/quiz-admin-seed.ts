import "server-only";

import { Types } from "mongoose";

import {
  createQuizGenerationLog,
  generateUniqueQuestionsForTopic,
  getQuestionSignature,
  parseAdminSeedCount,
  upsertQuizTopicFromPlan,
} from "@/lib/quiz-generation";
import { suggestQuizTopicPlans } from "@/lib/llm";
import { QUIZ_STARTER_SEED } from "@/lib/quiz-seed-data";
import { normalizeQuizText } from "@/lib/quiz-topic-utils";
import { getPlatformConfig } from "@/models/PlatformConfig";
import QuizQuestion from "@/models/QuizQuestion";
import QuizTopic from "@/models/QuizTopic";

export type QuizSeedMode = "STARTER" | "SMART" | "TOPIC_SEED";

export type AdminSeedSession = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
};

export class QuizSeedHttpError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(status: number, payload: Record<string, unknown>) {
    super(typeof payload.error === "string" ? payload.error : "Quiz seed failed.");
    this.name = "QuizSeedHttpError";
    this.status = status;
    this.payload = payload;
  }
}

type SmartSeedPayload = {
  prompt?: string;
  count?: number;
  maxTopics?: number;
};

const MAX_SMART_TOPICS = 8;

function parseMaxTopics(value: unknown, fallback: number) {
  const normalized =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(normalized) || normalized < 1) {
    return fallback;
  }

  return Math.min(MAX_SMART_TOPICS, Math.floor(normalized));
}

export async function seedStarterQuizData(session: AdminSeedSession) {
  let topicsCreated = 0;
  let topicsReused = 0;
  let questionsCreated = 0;
  let questionsSkipped = 0;

  for (const seedTopic of QUIZ_STARTER_SEED) {
    const { topic, created } = await upsertQuizTopicFromPlan({
      subject: seedTopic.subject,
      topic: seedTopic.topic,
      level: seedTopic.level,
      isActive: true,
    });

    if (created) {
      topicsCreated += 1;
    } else {
      topicsReused += 1;
    }

    const existingQuestions = await QuizQuestion.find({ topicId: topic._id })
      .select("questionText")
      .lean();

    const knownSignatures = new Set(
      existingQuestions.map((question) => getQuestionSignature(question.questionText)),
    );

    const questionsToInsert = seedTopic.questions.flatMap((question) => {
      const signature = getQuestionSignature(question.questionText);

      if (knownSignatures.has(signature)) {
        questionsSkipped += 1;
        return [];
      }

      knownSignatures.add(signature);
      return [
        {
          topicId: topic._id,
          questionText: question.questionText,
          options: question.options,
          correctOptionIndex: question.correctOptionIndex,
          explanation: question.explanation,
        },
      ];
    });

    if (questionsToInsert.length === 0) {
      continue;
    }

    await QuizQuestion.insertMany(questionsToInsert);
    questionsCreated += questionsToInsert.length;

    await createQuizGenerationLog({
      adminId: session.user.id,
      adminName: session.user.name ?? "Admin",
      adminEmail: session.user.email ?? null,
      topicId: topic._id.toString(),
      subject: topic.subject,
      topic: topic.topic,
      level: topic.level,
      field: topic.field ?? null,
      mode: "STARTER_SEED",
      requestedCount: questionsToInsert.length,
      createdCount: questionsToInsert.length,
    });
  }

  return {
    success: true,
    topicsCreated,
    topicsReused,
    questionsCreated,
    questionsSkipped,
    totalSeedTopics: QUIZ_STARTER_SEED.length,
    message:
      questionsCreated > 0
        ? `Starter quiz data seeded: ${topicsCreated} topics created and ${questionsCreated} questions inserted.`
        : "Starter quiz data already exists. No new questions were inserted.",
  };
}

export async function seedSmartQuizData(
  session: AdminSeedSession,
  body: SmartSeedPayload,
) {
  const config = await getPlatformConfig();
  const requestedCount = parseAdminSeedCount(body.count, config.quizQuestionCount);
  const maxTopics = parseMaxTopics(body.maxTopics, Math.min(4, requestedCount));
  const prompt = normalizeQuizText(body.prompt ?? "");

  const plans = await suggestQuizTopicPlans({
    prompt:
      prompt ||
      "Generate a balanced mix across Class 5 to Class 10, Plus 2 fields, and bachelor fields.",
    totalQuestions: requestedCount,
    maxTopics,
  });

  if (plans.length === 0) {
    throw new QuizSeedHttpError(503, {
      error:
        "The AI could not produce a usable topic plan right now. Please try again with a clearer prompt.",
    });
  }

  let topicsCreated = 0;
  let topicsReused = 0;
  let totalQuestionsCreated = 0;

  const results: Array<{
    topicId: string;
    subject: string;
    topic: string;
    level: string;
    field: string | null;
    requestedCount: number;
    createdCount: number;
    totalQuestionCount: number;
  }> = [];

  for (const plan of plans) {
    const { topic, created } = await upsertQuizTopicFromPlan({
      subject: plan.subject,
      topic: plan.topic,
      level: plan.level,
      field: plan.field ?? null,
      searchAliases: plan.searchAliases,
      isActive: true,
    });

    if (created) {
      topicsCreated += 1;
    } else {
      topicsReused += 1;
    }

    const generation = await generateUniqueQuestionsForTopic({
      topicId: topic._id.toString(),
      subject: topic.subject,
      topic: topic.topic,
      level: topic.level,
      field: topic.field ?? null,
      requestedCount: plan.questionCount,
    });

    totalQuestionsCreated += generation.createdCount;
    results.push({
      topicId: topic._id.toString(),
      subject: topic.subject,
      topic: topic.topic,
      level: topic.level,
      field: topic.field ?? null,
      requestedCount: plan.questionCount,
      createdCount: generation.createdCount,
      totalQuestionCount: generation.totalQuestionCount,
    });

    await createQuizGenerationLog({
      adminId: session.user.id,
      adminName: session.user.name ?? "Admin",
      adminEmail: session.user.email ?? null,
      topicId: topic._id.toString(),
      subject: topic.subject,
      topic: topic.topic,
      level: topic.level,
      field: topic.field ?? null,
      mode: "SMART_SEED",
      searchQuery: prompt || null,
      requestedCount: plan.questionCount,
      createdCount: generation.createdCount,
    });
  }

  if (totalQuestionsCreated === 0) {
    throw new QuizSeedHttpError(503, {
      error:
        "No brand-new questions were created from this AI seed run. Try a different prompt or run it again for another batch.",
      plans: results,
    });
  }

  return {
    success: true,
    mode: "SMART",
    prompt: prompt || null,
    requestedCount,
    createdTopicCount: topicsCreated,
    reusedTopicCount: topicsReused,
    totalQuestionsCreated,
    partial: totalQuestionsCreated < requestedCount,
    plans: results,
    message: `Generated ${totalQuestionsCreated} questions across ${results.length} topic plans.`,
  };
}

export async function seedSingleQuizTopic(input: {
  session: AdminSeedSession;
  topicId: string;
  count?: number;
}) {
  if (!Types.ObjectId.isValid(input.topicId)) {
    throw new QuizSeedHttpError(404, { error: "Quiz topic not found." });
  }
  const [config, topic] = await Promise.all([
    getPlatformConfig(),
    QuizTopic.findById(input.topicId).lean(),
  ]);

  if (!topic) {
    throw new QuizSeedHttpError(404, { error: "Quiz topic not found." });
  }

  const requestedCount = parseAdminSeedCount(input.count, config.quizQuestionCount);
  const generationResult = await generateUniqueQuestionsForTopic({
    topicId: topic._id.toString(),
    subject: topic.subject,
    topic: topic.topic,
    level: topic.level,
    field: topic.field ?? null,
    requestedCount,
  });

  if (generationResult.createdCount === 0) {
    throw new QuizSeedHttpError(503, {
      error:
        "No new quiz questions could be generated for this topic right now. Check AI provider availability or try again later.",
    });
  }

  await createQuizGenerationLog({
    adminId: input.session.user.id,
    adminName: input.session.user.name ?? "Admin",
    adminEmail: input.session.user.email ?? null,
    topicId: topic._id.toString(),
    subject: topic.subject,
    topic: topic.topic,
    level: topic.level,
    field: topic.field ?? null,
    mode: "TOPIC_SEED",
    requestedCount,
    createdCount: generationResult.createdCount,
  });

  const partial = generationResult.createdCount < requestedCount;

  return {
    success: true,
    topicId: topic._id.toString(),
    requestedCount,
    createdCount: generationResult.createdCount,
    totalQuestionCount: generationResult.totalQuestionCount,
    partial,
    message: partial
      ? `Seeded ${generationResult.createdCount} new questions. The batch is short of the requested ${requestedCount}, so you can run the seed again if needed.`
      : `Seeded ${generationResult.createdCount} new questions for ${topic.subject} / ${topic.topic} / ${topic.level}.`,
  };
}
