import { NextResponse, after } from "next/server";
import mongoose from "mongoose";

import { connectToDatabase } from "@/lib/mongodb";
import { getChannelRoomName, prepareChannelRoom } from "@/lib/livekit-room";
import { emitQuestionUpdated, emitChannelMessage, emitNotification, emitNewChannel } from "@/lib/pusher/pusherServer";
import { questionSummary } from "@/lib/question-summary";
import { getAuthenticatedUser } from "@/lib/unified-auth";
import Channel from "@/models/Channel";
import Message from "@/models/Message";
import { getPlatformConfig, getFormatDurationMinutes } from "@/models/PlatformConfig";
import Question from "@/models/Question";
import User from "@/models/User";
import type { FeedQuestion } from "@/types/question";
import type { ChannelDetail, ChatMessage } from "@/types/channel";
import Notification from "@/models/Notification";
import { checkTeacherStudentPattern } from "@/lib/anti-cheat";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteParams) {
  try {
    const authenticatedUser = await getAuthenticatedUser(_request);

    if (!authenticatedUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (authenticatedUser.role !== "TEACHER") {
      return NextResponse.json(
        { error: "Only teachers can accept questions" },
        { status: 403 },
      );
    }

    const { id } = await context.params;

    await connectToDatabase();

    const question = await Question.findById(id).populate(
      "askerId",
      "name username userImage",
    );

    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    // Cannot accept own question
    if (question.askerId._id.toString() === authenticatedUser.id) {
      return NextResponse.json(
        { error: "You cannot accept your own question" },
        { status: 403 },
      );
    }

    // Only OPEN or RESET questions can be accepted
    if (question.status !== "OPEN" && question.status !== "RESET") {
      return NextResponse.json(
        { error: "This question is no longer open for acceptance" },
        { status: 409 },
      );
    }

    // Get platform config for format time limits
    const config = await getPlatformConfig();
    const formatDurationMinutes = getFormatDurationMinutes(config, question.answerFormat);

    const now = new Date();
    const timerDeadline = new Date(now.getTime() + formatDurationMinutes * 60 * 1000);

    // Claim the question first — this is the guard against a double-accept,
    // so it must land before we create any channel that depends on it.
    question.status = "ACCEPTED";
    question.acceptedById = authenticatedUser.id;
    question.acceptedAt = now;
    await question.save();

    // The channel _id is pre-generated, so the channel row, the auto-message
    // that lives in it, and the acceptor lookup have no ordering dependency
    // on each other — issue all three concurrently instead of serially.
    const channelId = new mongoose.Types.ObjectId();
    const roomName = getChannelRoomName(channelId.toString());

    // Format duration for the message
    const durationText =
      formatDurationMinutes >= 60
        ? `${Math.floor(formatDurationMinutes / 60)} hour${Math.floor(formatDurationMinutes / 60) > 1 ? "s" : ""}`
        : `${formatDurationMinutes} minutes`;

    // Create the auto-message from acceptor — concise, includes the question title
    const autoMessageContent = `✅ Question accepted! Answer coming within ${durationText}.\n\n📌 "${questionSummary(question)}"`;

    const [channel, autoMessage, acceptor] = await Promise.all([
      Channel.create({
        _id: channelId,
        questionId: question._id,
        askerId: question.askerId._id,
        acceptorId: authenticatedUser.id,
        openedAt: now,
        timerDeadline,
        status: "ACTIVE",
        roomName,
      }),
      Message.create({
        channelId,
        senderId: authenticatedUser.id,
        content: autoMessageContent,
        isSystemMessage: true,
        sentAt: now,
      }),
      User.findById(authenticatedUser.id).select("name username userImage").lean(),
    ]);

    // Fire-and-forget: provision the LiveKit room on the SFU so the first
    // participant to connect skips the cold-start. Never awaited — channel
    // accept must not block on LiveKit availability.
    void prepareChannelRoom(channelId.toString());

    const acceptorName = (acceptor as { name?: string })?.name || authenticatedUser.name || "Someone";

    // Build the FeedQuestion shape for broadcast
    const asker = question.askerId as unknown as {
      _id: { toString(): string };
      name?: string;
      username?: string;
      userImage?: string;
    };

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
      status: question.status,
      subject: question.subject || undefined,
      stream: question.stream || undefined,
      level: question.level || undefined,
      resetCount: question.resetCount,
      reactions: reactions.map((r: { userId: { toString(): string }; type: string }) => ({
        userId: r.userId?.toString() || "",
        type: r.type as "like" | "insightful" | "same_doubt",
      })),
      acceptedById: authenticatedUser.id,
      acceptedAt: question.acceptedAt!.toISOString(),
      acceptedByName: acceptorName,
      answerCount: 0,
      reactionCount: reactions.length,
      commentCount: 0,
      createdAt: question.createdAt.toISOString(),
      updatedAt: question.updatedAt.toISOString(),
    };

    // The auto-message as the accepting teacher's client will render it.
    const bootstrapMessage: ChatMessage = {
      id: autoMessage._id.toString(),
      channelId: channel._id.toString(),
      senderId: authenticatedUser.id,
      senderName: acceptorName,
      content: autoMessageContent,
      mediaUrl: null,
      mediaType: null,
      isSystemMessage: true,
      isOwn: true,
      isSeen: false,
      isDelivered: true,
      isMarkedAsAnswer: false,
      isDeleted: false,
      sentAt: now.toISOString(),
      callInfo: null,
    };

    // Everything the workspace screen needs, in the exact shape
    // GET /api/channels/[id] returns — so the client can seed its cache and
    // skip that second round trip entirely.
    const channelDetail: ChannelDetail = {
      id: channel._id.toString(),
      questionId: question._id.toString(),
      askerId: asker._id.toString(),
      acceptorId: authenticatedUser.id,
      openedAt: now.toISOString(),
      timerDeadline: timerDeadline.toISOString(),
      timeExtensionCount: 0,
      closedAt: null,
      status: "ACTIVE",
      isClosedByAsker: false,
      ratingGiven: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      questionTitle: questionSummary(question),
      questionBody: question.body,
      questionImages: Array.isArray(question.images) ? question.images : [],
      answerFormat: question.answerFormat,
      answerVisibility: question.answerVisibility,
      askerName: asker.name || "Anonymous",
      askerUsername: asker.username || undefined,
      askerImage: asker.userImage || undefined,
      acceptorName,
      acceptorUsername: (acceptor as { username?: string } | null)?.username || undefined,
      acceptorImage: (acceptor as { userImage?: string } | null)?.userImage || undefined,
      formatDurationMinutes,
      maxVideoDurationMinutes: config.maxVideoDurationMinutes,
      isAnswerSubmitted: false,
    };

    // Every remaining side effect below notifies *other* people (the asker's
    // devices, the feed) — none of it changes what the accepting teacher sees.
    // after() flushes the response first and runs this on the same invocation,
    // so the teacher stops waiting on the asker's push fanout.
    after(async () => {
      const channelListItem = {
        id: channel._id.toString(),
        questionTitle: questionSummary(question),
        counterpartName: acceptorName,
        counterpartImage: (acceptor as { userImage?: string | null } | null)?.userImage || undefined,
        status: "ACTIVE",
        lastMessagePreview: autoMessageContent,
        lastMessageAt: now.toISOString(),
        unreadCount: 1, // The auto-message is unread for the asker
        timerDeadline: timerDeadline.toISOString(),
        role: "asker",
      };

      await Promise.allSettled([
        // The asker sees the auto-message as incoming, not their own.
        emitChannelMessage(channel._id.toString(), {
          ...bootstrapMessage,
          isOwn: false,
        }),
        emitQuestionUpdated(feedQuestion),
        emitNewChannel(asker._id.toString(), channelListItem),
        Notification.create({
          userId: asker._id,
          type: "QUESTION_ACCEPTED",
          message: `${acceptorName} accepted your question. Channel is now open.`,
          href: `/workspace/${channel._id.toString()}`,
        }).then((acceptNotif) =>
          acceptNotif ? emitNotification(asker._id.toString(), acceptNotif) : undefined,
        ),
        checkTeacherStudentPattern(authenticatedUser.id, asker._id.toString()),
      ]);
    });

    // Return channelId so the UI can redirect, plus the full channel payload
    // so the workspace screen renders populated on first paint.
    return NextResponse.json({
      ...feedQuestion,
      channelId: channel._id.toString(),
      timerDeadline: timerDeadline.toISOString(),
      formatDurationMinutes,
      channelBootstrap: {
        channel: channelDetail,
        messages: [bootstrapMessage],
      },
    });
  } catch (error) {
    console.error("[POST /api/questions/[id]/accept]", error);
    return NextResponse.json(
      { error: "Failed to accept question" },
      { status: 500 },
    );
  }
}
