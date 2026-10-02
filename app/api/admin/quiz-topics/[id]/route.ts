import { Types } from "mongoose";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import {
  normalizeQuizAliases,
  normalizeQuizField,
  normalizeQuizLevel,
  normalizeQuizText,
  resolveQuizTopicMetadata,
} from "@/lib/quiz-topic-utils";
import QuizQuestion from "@/models/QuizQuestion";
import QuizSession from "@/models/QuizSession";
import QuizTopic from "@/models/QuizTopic";

type QuizTopicPayload = {
  subject?: string;
  topic?: string;
  level?: string;
  field?: string | null;
  searchAliases?: string[];
  isActive?: boolean;
};

function serializeTopic(topic: {
  _id: { toString(): string };
  subject: string;
  topic: string;
  level: string;
  field?: string | null;
  searchAliases?: string[];
  isActive: boolean;
}) {
  const metadata = resolveQuizTopicMetadata({
    subject: topic.subject,
    topic: topic.topic,
    level: topic.level,
    field: topic.field ?? null,
    searchAliases: topic.searchAliases ?? [],
  });

  return {
    id: topic._id.toString(),
    subject: metadata.subject,
    topic: metadata.topic,
    level: metadata.level,
    field: metadata.field,
    levelCategory: metadata.levelCategory,
    searchAliases: metadata.searchAliases,
    isActive: topic.isActive,
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const payload = (await request.json()) as QuizTopicPayload;

    const updates: Record<string, unknown> = {};
    if (typeof payload.subject === "string") {
      updates.subject = normalizeQuizText(payload.subject);
    }
    if (typeof payload.topic === "string") {
      updates.topic = normalizeQuizText(payload.topic);
    }
    if (typeof payload.field === "string" || payload.field === null) {
      updates.field = normalizeQuizField(payload.field);
    }
    if (typeof payload.level === "string") {
      updates.level = normalizeQuizLevel(
        payload.level,
        typeof updates.field === "string" || updates.field === null
          ? (updates.field as string | null)
          : normalizeQuizField(payload.field),
      );
    }
    if (Array.isArray(payload.searchAliases)) {
      updates.searchAliases = normalizeQuizAliases(payload.searchAliases);
    }
    if (typeof payload.isActive === "boolean") {
      updates.isActive = payload.isActive;
    }

    await connectToDatabase();

    const topic = await QuizTopic.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!topic) {
      return NextResponse.json({ error: "Quiz topic not found." }, { status: 404 });
    }

    const [questionCount, sessionCount] = await Promise.all([
      QuizQuestion.countDocuments({ topicId: topic._id }),
      QuizSession.countDocuments({ topicId: topic._id }),
    ]);

    return NextResponse.json({
      topic: {
        ...serializeTopic(topic),
        questionCount,
        sessionCount,
      },
    });
  } catch (error: unknown) {
    console.error("[PATCH /api/admin/quiz-topics/[id]]", error);

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return NextResponse.json(
        { error: "That quiz topic already exists." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Failed to update quiz topic." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await connectToDatabase();

    const [questionCount, sessionCount] = await Promise.all([
      QuizQuestion.countDocuments({ topicId: id }),
      QuizSession.countDocuments({ topicId: id }),
    ]);

    if (questionCount > 0 || sessionCount > 0) {
      return NextResponse.json(
        {
          error:
            "This topic already has quiz questions or session history. Deactivate it instead of deleting.",
        },
        { status: 400 },
      );
    }

    const deleted = await QuizTopic.findByIdAndDelete(id);

    if (!deleted) {
      return NextResponse.json({ error: "Quiz topic not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/admin/quiz-topics/[id]]", error);
    return NextResponse.json(
      { error: "Failed to delete quiz topic." },
      { status: 500 },
    );
  }
}
