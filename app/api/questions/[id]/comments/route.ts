import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { after } from "next/server";

import { llmGenerate } from "@/lib/llm";
import { connectToDatabase } from "@/lib/mongodb";
import { notifyUser } from "@/lib/notifications/notify-user";
import PeerComment from "@/models/PeerComment";
import { getPlatformConfig } from "@/models/PlatformConfig";
import Question from "@/models/Question";
import User from "@/models/User";
import { getAuthenticatedUser } from "@/lib/unified-auth";

type RouteParams = {
  params: Promise<{ id: string }>;
};

type CommentRequestBody = {
  content?: unknown;
};

type QuestionSummary = {
  title?: string;
  body?: string;
};

type UnevaluatedComment = {
  _id: { toString(): string };
  questionId: QuestionSummary;
  content: string;
};

type SerializedComment = {
  _id: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  milestoneGroup?: number | null;
  questionId?: string | null;
  studentId?: {
    _id?: string;
    name?: string;
    userImage?: string | null;
    username?: string;
  } | null;
};

type RawCommentLike = {
  _id?: { toString?: () => string } | string;
  content?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  milestoneGroup?: number | null;
  questionId?: { _id?: { toString?: () => string }; toString?: () => string } | string | null;
  studentId?:
    | {
        _id?: { toString?: () => string } | string;
        name?: string;
        userImage?: string | null;
        username?: string;
      }
    | null;
};

function parseLimit(rawLimit: string | null): number {
  const limit = Number.parseInt(rawLimit ?? "20", 10);

  if (!Number.isFinite(limit) || limit < 1) {
    return 20;
  }

  return Math.min(limit, 100);
}

function stripCodeFences(value: string): string {
  return value
    .replaceAll("```json", "")
    .replaceAll("```", "")
    .trim();
}

function clampScore(value: number, minReward: number, maxReward: number): number {
  if (!Number.isFinite(value)) {
    return minReward;
  }

  return Math.max(minReward, Math.min(maxReward, value));
}

function parseAiScore(rawResponse: string, minReward: number, maxReward: number): number {
  const normalized = stripCodeFences(rawResponse);

  try {
    const parsed = JSON.parse(normalized) as { score?: unknown };
    const score = Number.parseFloat(String(parsed.score ?? ""));

    return clampScore(score, minReward, maxReward);
  } catch {
    return minReward;
  }
}

function serializeComment(comment: RawCommentLike): SerializedComment {
  const student = comment?.studentId;
  const questionId = comment?.questionId;

  const createdAtVal = comment?.createdAt;
  const updatedAtVal = comment?.updatedAt;

  return {
    _id: comment?._id?.toString?.() ?? String(comment?._id ?? ""),
    content: String(comment?.content ?? ""),
    createdAt: createdAtVal ? new Date(createdAtVal as string | number | Date).toISOString() : new Date().toISOString(),
    updatedAt: updatedAtVal
      ? new Date(updatedAtVal as string | number | Date).toISOString()
      : undefined,
    milestoneGroup: comment?.milestoneGroup ?? null,
    questionId:
      typeof questionId === "string"
        ? questionId
        : questionId?._id?.toString?.() ?? questionId?.toString?.() ?? null,
    studentId:
      student && typeof student === "object"
        ? {
            _id: student._id?.toString?.() ?? undefined,
            name: student.name,
            userImage: student.userImage ?? null,
            username: student.username,
          }
        : null,
  };
}

function dedupeCommentsById(comments: SerializedComment[]): SerializedComment[] {
  const unique = new Map<string, SerializedComment>();

  for (const comment of comments) {
    unique.set(comment._id, comment);
  }

  return Array.from(unique.values()).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function GET(request: Request, context: RouteParams) {
  try {
    const { id: questionId } = await context.params;
    if (!Types.ObjectId.isValid(questionId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get("limit"));

    await connectToDatabase();

    const comments = await PeerComment.find({ questionId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("studentId", "name userImage username")
      .lean();

    return NextResponse.json(
      dedupeCommentsById(comments.map((comment) => serializeComment(comment))),
    );
  } catch (error) {
    console.error("[GET /api/questions/[id]/comments]", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteParams) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);

    if (!authenticatedUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (
      authenticatedUser.role !== "STUDENT" &&
      authenticatedUser.role !== "TEACHER"
    ) {
      return NextResponse.json(
        { error: "Only students and teachers can post comments" },
        { status: 403 },
      );
    }

    const { id: questionId } = await context.params;
    if (!Types.ObjectId.isValid(questionId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const body = (await request.json()) as CommentRequestBody;
    const content =
      typeof body.content === "string" ? body.content.trim() : "";

    if (!content) {
      return NextResponse.json(
        { error: "Comment content is required" },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const question = await Question.findById(questionId).select("askerId title");

    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    if (question.askerId.toString() === authenticatedUser.id) {
      return NextResponse.json(
        { error: "You cannot comment on your own question" },
        { status: 400 },
      );
    }

    const newComment = await PeerComment.create({
      questionId,
      studentId: authenticatedUser.id,
      content,
    });

    let pointsAwarded = 0;
    let milestoneMessage: string | null = null;
    let milestoneReached = false;

    if (authenticatedUser.role === "STUDENT") {
      const uniqueQuestionIds = await PeerComment.distinct("questionId", {
        studentId: authenticatedUser.id,
      });
      const uniqueCount = uniqueQuestionIds.length;

      const config = await getPlatformConfig();
      const threshold = Math.max(1, config.peerCommentPointThreshold || 10);

      milestoneReached = uniqueCount > 0 && uniqueCount % threshold === 0;

      if (milestoneReached) {
        const milestoneGroup = Math.floor(uniqueCount / threshold);
        const unevaluatedComments = (await PeerComment.find({
          studentId: authenticatedUser.id,
          milestoneGroup: null,
        })
          .sort({ createdAt: -1 })
          .limit(threshold)
          .populate("questionId", "title body")) as unknown as UnevaluatedComment[];

        if (unevaluatedComments.length === threshold) {
          const minReward = config.peerCommentMinPointReward || 0.5;
          const maxReward = config.peerCommentMaxPointReward || 1;
          const evaluationParts = [
            "Below are multiple question-and-answer pairs from the same student.",
            "",
          ];

          unevaluatedComments.forEach((comment, index) => {
            evaluationParts.push(`Pair ${index + 1}:`);
            evaluationParts.push(`Question: ${comment.questionId?.title ?? ""}`);
            evaluationParts.push(comment.questionId?.body ?? "");
            evaluationParts.push(`Student's Answer: ${comment.content}`);
            evaluationParts.push("");
          });

          const systemPrompt = [
            "You are a strict academic evaluator.",
            "Rate the overall quality and helpfulness of this batch of student comments.",
            `Return a score between ${minReward} and ${maxReward}.`,
            `Low-effort or irrelevant answers should be closer to ${minReward}.`,
            `Excellent and accurate answers should be closer to ${maxReward}.`,
            'Return only valid JSON in this exact shape: {"score": number}',
          ].join(" ");

          try {
            const aiResponse = await llmGenerate(evaluationParts.join("\n"), {
              systemPrompt,
              json: true,
              temperature: 0.1,
            });

            pointsAwarded = parseAiScore(aiResponse, minReward, maxReward);

            await User.findByIdAndUpdate(authenticatedUser.id, {
              $inc: { points: pointsAwarded },
            });

            const commentIds = unevaluatedComments.map((comment) => comment._id);

            await PeerComment.updateMany(
              { _id: { $in: commentIds } },
              { $set: { milestoneGroup } },
            );

            milestoneMessage = `Milestone reached. AI evaluated your last ${threshold} comments and awarded ${pointsAwarded} points.`;
          } catch (llmError) {
            console.error(
              "[POST /api/questions/[id]/comments] AI evaluation failed",
              llmError,
            );
          }
        }
      }
    }

    await newComment.populate("studentId", "name userImage username");

    // Notify the asker that someone commented on their question.
    // Self-comments are already blocked above, so askerId !== commenter here.
    const askerId = question.askerId.toString();
    const commenterName = authenticatedUser.name;
    const questionTitle = String(question.title || "your question").slice(0, 80);
    after(async () => {
      await notifyUser({
        userId: askerId,
        type: "COMMENT_RECEIVED",
        message: `${commenterName} commented on: ${questionTitle}`,
        href: "/feed",
      });
    });

    return NextResponse.json({
      success: true,
      comment: serializeComment(newComment.toObject()),
      milestoneReached: milestoneReached && pointsAwarded > 0,
      pointsAwarded,
      milestoneMessage,
    });
  } catch (error) {
    console.error("[POST /api/questions/[id]/comments]", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
