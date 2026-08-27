import { NextResponse, after } from "next/server";

import { connectToDatabase } from "@/lib/mongodb";
import { REACTION_TYPES } from "@/lib/question-types";
import { emitQuestionUpdated } from "@/lib/pusher/pusherServer";
import { getQuestionCounts } from "@/lib/question-counts";
import {
  cancelReactionNotification,
  flushDueReactionNotifications,
  queueReactionNotification,
} from "@/lib/reaction-notifications";
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

    const counts = await getQuestionCounts(question);

    const feedQuestion: FeedQuestion = {
      id: question._id.toString(),
      channelId: latestChannel?._id?.toString() ?? null,
      askerId: asker._id.toString(),
      askerName: asker.name || "Anonymous",
      askerUsername: asker.username || undefined,
      askerImage: asker.userImage || undefined,
      title: question.title,
      body: question.body,
      // Must be carried on every question broadcast. `images` is optional on
      // FeedQuestion, so omitting it type-checks — but the mobile feed merges
      // this payload over the card it already has, and a missing `images`
      // normalizes to `[]`, which blanked the photo on a photo-only question
      // for every client that saw the reaction until the next feed refetch.
      images: Array.isArray(question.images) ? question.images : [],
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
      answerCount: counts.answerCount,
      reactionCount: reactions.length,
      commentCount: counts.commentCount,
      createdAt: question.createdAt.toISOString(),
      updatedAt: question.updatedAt.toISOString(),
    };

    await emitQuestionUpdated(feedQuestion).catch(() => {});

    // Notify the asker when someone reacts to their post (not themselves).
    //
    // Deferred, not sent here. Reactions are a toggle, so tapping on and off
    // used to fire one push per tap; instead each reaction refreshes a pending
    // row and the push goes out only once this reactor has been still for
    // REACTION_NOTIFY_QUIET_MS. Removing the reaction cancels the pending row
    // outright, so a tap the user immediately undoes notifies nobody.
    const askerId = asker._id.toString();
    const isOwnQuestion = askerId === authenticatedUser.id;

    // Not just `authenticatedUser.name`: the bearer-token path in unified-auth
    // passes the JWT's name straight through with no fallback (only the session
    // path defaults it), so a token minted without one rendered this as
    // "undefined reacted to your question" — and the mobile app is exactly the
    // client on that path.
    const reactorName = authenticatedUser.name?.trim() || "Someone";
    const questionTitle = questionSummary(question, 80, "your photo question");
    const questionId = question._id.toString();

    after(async () => {
      if (!isOwnQuestion) {
        if (reactionAdded) {
          await queueReactionNotification({
            questionId,
            askerId,
            reactorId: authenticatedUser.id,
            reactorName,
            reactionType: body.type,
            questionSummary: questionTitle,
          });
        } else {
          await cancelReactionNotification(questionId, authenticatedUser.id);
        }
      }

      // Opportunistic flush of everyone *else's* due notifications — this
      // reactor's row was just refreshed, so the cutoff excludes it. The cron
      // is the guaranteed delivery mechanism, but traffic is far more frequent
      // than any cron interval, so in practice this is what actually delivers
      // them, and reaction notifications keep working even if the cron is
      // never registered.
      await flushDueReactionNotifications().catch((err) =>
        console.error("[POST /api/questions/[id]/react] flush failed", err),
      );
    });

    return NextResponse.json(feedQuestion);
  } catch (error) {
    console.error("[POST /api/questions/[id]/react]", error);
    return NextResponse.json(
      { error: "Failed to toggle reaction" },
      { status: 500 },
    );
  }
}
