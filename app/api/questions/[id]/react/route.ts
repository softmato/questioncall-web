import { NextResponse, after } from "next/server";

import { connectToDatabase } from "@/lib/mongodb";
import { REACTION_TYPES } from "@/lib/question-types";
import { emitQuestionUpdated } from "@/lib/pusher/pusherServer";
import { notifyUser } from "@/lib/notifications/notify-user";
import { questionSummary } from "@/lib/question-summary";
import { getAuthenticatedUser } from "@/lib/unified-auth";
import Channel from "@/models/Channel";
import Question from "@/models/Question";
import type { FeedQuestion, ReactToQuestionPayload } from "@/types/question";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteParams) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);

    if (!authenticatedUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = (await request.json()) as ReactToQuestionPayload;

    if (!body.type || !(REACTION_TYPES as readonly string[]).includes(body.type)) {
      return NextResponse.json(
        { error: "Invalid reaction type" },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const question = await Question.findById(id).populate(
      "askerId",
      "name username userImage",
    );

    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    const reactions = Array.isArray(question.reactions) ? question.reactions : [];

    // Toggle: if user already has any reaction, remove it; if same type, just remove (toggle off)
    // If different type or no reaction, set the new one
    const existingIndex = reactions.findIndex(
      (r: { userId: { toString(): string } }) =>
        r.userId.toString() === authenticatedUser.id,
    );

    let reactionAdded = false;
    if (existingIndex >= 0) {
      const existingType = reactions[existingIndex].type;
      reactions.splice(existingIndex, 1);
      if (existingType !== body.type) {
        reactions.push({ userId: authenticatedUser.id, type: body.type });
        reactionAdded = true;
      }
    } else {
      reactions.push({ userId: authenticatedUser.id, type: body.type });
      reactionAdded = true;
    }

    question.reactions = reactions;
    await question.save();

    const asker = question.askerId as unknown as {
      _id: { toString(): string };
      name?: string;
      username?: string;
      userImage?: string;
    };

    const acceptor = question.acceptedById
      ? { _id: question.acceptedById, name: undefined as string | undefined }
      : null;
    const latestChannel = await Channel.findOne({ questionId: question._id })
      .sort({ updatedAt: -1, openedAt: -1, createdAt: -1 })
      .select("_id")
      .lean();

    const feedQuestion: FeedQuestion = {
      id: question._id.toString(),
      channelId: latestChannel?._id?.toString() ?? null,
      askerId: asker._id.toString(),
      askerName: asker.name || "Anonymous",
      askerUsername: asker.username || undefined,
      askerImage: asker.userImage || undefined,
      title: question.title,
      body: question.body,
      answerFormat: question.answerFormat,
      answerVisibility: question.answerVisibility,
      status: question.status,
      subject: question.subject || undefined,
      stream: question.stream || undefined,
      level: question.level || undefined,
      resetCount: question.resetCount,
      reactions: reactions.map((r: { userId: { toString(): string }; type: string }) => ({
        userId: r.userId?.toString() || "",
        type: r.type as "like" | "insightful" | "same_doubt",
      })),
      acceptedById: acceptor?._id?.toString() || null,
      acceptedAt: question.acceptedAt
        ? new Date(question.acceptedAt).toISOString()
        : null,
      acceptedByName: acceptor?.name || null,
      answerCount: 0,
      reactionCount: reactions.length,
      commentCount: 0,
      createdAt: question.createdAt.toISOString(),
      updatedAt: question.updatedAt.toISOString(),
    };

    await emitQuestionUpdated(feedQuestion).catch(() => {});

    // Notify the asker when someone reacts to their post (not themselves).
    const askerId = asker._id.toString();
    if (reactionAdded && askerId !== authenticatedUser.id) {
      const reactorName = authenticatedUser.name;
      const questionTitle = questionSummary(question, 80, "your photo question");
      after(async () => {
        await notifyUser({
          userId: askerId,
          type: "REACTION_RECEIVED",
          message: `${reactorName} reacted to your question: ${questionTitle}`,
          href: "/feed",
        });
      });
    }

    return NextResponse.json(feedQuestion);
  } catch (error) {
    console.error("[POST /api/questions/[id]/react]", error);
    return NextResponse.json(
      { error: "Failed to toggle reaction" },
      { status: 500 },
    );
  }
}
