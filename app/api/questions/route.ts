import { NextResponse, after } from "next/server";

import { getAuthenticatedUser } from "@/lib/unified-auth";
import { connectToDatabase } from "@/lib/mongodb";
import { emitQuestionCreated } from "@/lib/pusher/pusherServer";
import { notifyUser } from "@/lib/notifications/notify-user";
import { ANSWER_FORMATS } from "@/lib/question-types";
import { questionSummary } from "@/lib/question-summary";
import Question from "@/models/Question";
import User from "@/models/User";
import type { CreateQuestionPayload, FeedQuestion } from "@/types/question";
import { getPlatformConfig, getHydratedPlans } from "@/models/PlatformConfig";

export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/api/questions/feed", request.url));
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "STUDENT") {
      return NextResponse.json(
        { error: "Only students can post questions" },
        { status: 403 },
      );
    }

    const body = (await request.json()) as CreateQuestionPayload;

    // The title is optional — the mobile ask flow is camera-first, so a photo
    // of the problem is a complete question on its own. What we do require is
    // that a question carries *something* answerable: a title or an image.
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const images = Array.isArray(body.images)
      ? body.images.filter((url): url is string => typeof url === "string" && !!url.trim())
      : [];

    if (title.length > 0 && title.length < 3) {
      return NextResponse.json(
        { error: "Title must be at least 3 characters" },
        { status: 400 },
      );
    }

    if (title.length > 180) {
      return NextResponse.json(
        { error: "Title must be 180 characters or fewer" },
        { status: 400 },
      );
    }

    if (!title && images.length === 0) {
      return NextResponse.json(
        { error: "Add a photo or a short title so it can be answered" },
        { status: 400 },
      );
    }

    const questionBody = typeof body.body === "string" ? body.body.trim() : "";
    if (questionBody.length > 5000) {
      return NextResponse.json(
        { error: "Details must be 5000 characters or fewer" },
        { status: 400 },
      );
    }

    const requestedAnswerFormat =
      typeof body.answerFormat === "string" ? body.answerFormat : "ANY";

    if (
      !ANSWER_FORMATS.includes(
        requestedAnswerFormat as (typeof ANSWER_FORMATS)[number],
      )
    ) {
      return NextResponse.json(
        { error: "Please choose a valid answer format selection." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const dbUser = await User.findById(user.id);
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const config = await getPlatformConfig();
    const plans = getHydratedPlans(config);
    const currentPlan = plans.find((p) => p.slug === dbUser.planSlug) || plans[0];
    const maxQuestions = currentPlan?.maxQuestions ?? 0;
    const bonusQuestions = dbUser.bonusQuestions ?? 0;
    const effectiveLimit =
      maxQuestions > 0 ? maxQuestions + bonusQuestions : maxQuestions;
    const questionsAsked = dbUser.questionsAsked ?? 0;

    // Subscription Check Logic
    const now = new Date();
    const subEnd = dbUser.subscriptionEnd ? new Date(dbUser.subscriptionEnd) : null;
    const isExpired = dbUser.trialUsed && (!subEnd || subEnd < now);

    if (isExpired) {
      if (dbUser.subscriptionStatus !== "EXPIRED") {
        await User.findByIdAndUpdate(dbUser._id, {
          subscriptionStatus: "EXPIRED",
        });
      }
      return NextResponse.json(
        { error: "Subscription expired. Please renew to ask questions." },
        { status: 403 },
      );
    }

    // Check question limit (not applicable for trial being activated)
    if (dbUser.trialUsed && effectiveLimit !== null && effectiveLimit > 0) {
      if (questionsAsked >= effectiveLimit) {
        const remaining = effectiveLimit - questionsAsked;
        return NextResponse.json(
          {
            error: "Question limit reached for your plan.",
            questionsRemaining: Math.max(0, remaining),
            maxQuestions: effectiveLimit,
            planSlug: dbUser.planSlug,
            bonusQuestions: bonusQuestions,
          },
          { status: 403 },
        );
      }
    }

    // Auto-start trial on first question if not used yet and no active sub
    if (!dbUser.trialUsed && dbUser.subscriptionStatus !== "ACTIVE") {
      const trialDays = config.trialDays;
      const trialEnd = new Date(
        now.getTime() + trialDays * 24 * 60 * 60 * 1000,
      );
      await User.findByIdAndUpdate(dbUser._id, {
        trialUsed: true,
        subscriptionStatus: "ACTIVE",
        subscriptionEnd: trialEnd,
        planSlug: "free",
        questionsAsked: 0,
      });
    }

    const question = await Question.create({
      askerId: user.id,
      title,
      body: questionBody,
      images,
      answerFormat: requestedAnswerFormat,
      answerVisibility: body.answerVisibility || "PUBLIC",
      subject: body.subject?.trim() || undefined,
      stream: body.stream?.trim() || undefined,
      level: body.level?.trim() || undefined,
    });

    // Increment the user's totalAsked counter and questionsAsked
    await User.findByIdAndUpdate(user.id, {
      $inc: { totalAsked: 1, questionsAsked: 1 },
    });

    // Build the FeedQuestion shape to broadcast + return
    const feedQuestion: FeedQuestion = {
      id: question._id.toString(),
      askerId: user.id,
      askerName: user.name || "Anonymous",
      askerUsername: dbUser.username || undefined,
      title: question.title,
      body: question.body,
      images: question.images || [],
      answerFormat: question.answerFormat,
      answerVisibility: question.answerVisibility,
      status: question.status,
      subject: question.subject || undefined,
      stream: question.stream || undefined,
      level: question.level || undefined,
      resetCount: question.resetCount,
      reactions: [],
      answerCount: 0,
      reactionCount: 0,
      commentCount: 0,
      createdAt: question.createdAt.toISOString(),
      updatedAt: question.updatedAt.toISOString(),
    };

    // Broadcast to all connected clients via Pusher
    await emitQuestionCreated(feedQuestion).catch(() => {
      // Pusher broadcast failure is non-fatal
    });

    // Fan-out push notifications for the new question. Runs after the response
    // via after() so it never blocks the request and still completes on
    // serverless.
    //
    // Two audiences, in priority order:
    //   1. Every active teacher — "New Question Posted", carrying the question
    //      text and its first attached photo. Questions are claimed
    //      first-come-first-served, so this is the whole supply side of the
    //      marketplace and must not be gated on subject.
    //   2. Everyone else whose free-text `interests` match the question's
    //      subject — the pre-existing, softer "Question For You".
    //
    // Teachers are excluded from (2) so a teacher who also listed the subject
    // as an interest gets one push, not two.
    after(async () => {
      const summary = questionSummary(feedQuestion, 120);
      const subject = typeof question.subject === "string" ? question.subject : "";
      // Only the first image: Android BigPictureStyle and the Web Notification
      // `image` slot both render exactly one.
      const previewImage = images[0] ?? null;
      const notifiedIds = new Set<string>([String(user.id)]);

      try {
        const teachers = await User.find({
          role: "TEACHER",
          _id: { $ne: user.id },
          isSuspended: { $ne: true },
          isDeleted: { $ne: true },
        })
          .select("_id")
          .lean<{ _id: { toString(): string } }[]>();

        const teacherMessage = subject ? `${subject}: ${summary}` : summary;
        const message = previewImage ? `${teacherMessage} 📷` : teacherMessage;
        for (const t of teachers) notifiedIds.add(t._id.toString());

        // Chunked rather than one big Promise.allSettled: each notifyUser is a
        // Mongo write plus an outbound push request, and the teacher roster is
        // unbounded. Firing all of them at once would exhaust the connection
        // pool and stall the rest of the function's requests.
        const FANOUT_CHUNK = 25;
        for (let i = 0; i < teachers.length; i += FANOUT_CHUNK) {
          await Promise.allSettled(
            teachers.slice(i, i + FANOUT_CHUNK).map((t) =>
              notifyUser({
                userId: t._id.toString(),
                type: "NEW_QUESTION_POSTED",
                message,
                href: "/feed",
                image: previewImage,
                extraData: {
                  questionId: question._id.toString(),
                  ...(subject ? { subject } : {}),
                  ...(previewImage ? { imageUrl: previewImage } : {}),
                },
              }),
            ),
          );
        }
        console.log(
          `[POST /api/questions] notified ${teachers.length} teacher(s) of question=${question._id.toString()}`,
        );
      } catch (err) {
        console.error("[POST /api/questions] teacher fan-out failed", err);
      }

      // Case-insensitive collation is required because interests are free-text
      // (user-typed) while subject is a canonical dropdown value — an exact
      // match would almost never fire.
      if (!subject) return;

      try {
        const interestedUsers = await User.find({
          interests: subject,
          _id: { $ne: user.id },
          isSuspended: { $ne: true },
          isDeleted: { $ne: true },
        })
          .collation({ locale: "en", strength: 2 })
          .select("_id")
          .limit(100)
          .lean<{ _id: { toString(): string } }[]>();

        const message = `New ${subject} question: ${questionSummary(feedQuestion, 80)}`;
        await Promise.allSettled(
          interestedUsers
            .filter((u) => !notifiedIds.has(u._id.toString()))
            .map((u) =>
              notifyUser({
                userId: u._id.toString(),
                type: "NEW_QUESTION_INTEREST",
                message,
                href: "/feed",
              }),
            ),
        );
      } catch (err) {
        console.error("[POST /api/questions] interest fan-out failed", err);
      }
    });

    return NextResponse.json(feedQuestion, { status: 201 });
  } catch (error) {
    console.error("[POST /api/questions]", error);
    return NextResponse.json(
      { error: "Failed to create question" },
      { status: 500 },
    );
  }
}
