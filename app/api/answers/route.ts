import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { getAuthenticatedUser } from "@/lib/unified-auth";
import { processExpiredChannels } from "@/lib/channel-expiration";
import { connectToDatabase } from "@/lib/mongodb";
import { pusherServer, emitNotification } from "@/lib/pusher/pusherServer";
import { ANSWER_SUBMITTED_EVENT, getChannelPusherName } from "@/lib/pusher/events";
import {
  buildAnswerFormatFromSelection,
  getAnswerFormatLabel,
  getAnswerFormatRequirements,
} from "@/lib/question-types";
import Answer from "@/models/Answer";
import Channel from "@/models/Channel";
import Message from "@/models/Message";
import Notification from "@/models/Notification";
import User from "@/models/User";
import { getPlatformConfig } from "@/models/PlatformConfig";
import type { AnswerFormat, BaseAnswerFormat } from "@/types/question";

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { channelId, markedMessageIds } = await req.json();

    if (!channelId) {
      return NextResponse.json({ error: "Missing channelId" }, { status: 400 });
    }
    if (!Types.ObjectId.isValid(channelId)) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    await connectToDatabase();

    // Verify channel and access
    let channel = await Channel.findById(channelId).populate("questionId");
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    if (channel.acceptorId.toString() !== user.id) {
      return NextResponse.json(
        { error: "Only the acceptor (teacher) can submit an answer" },
        { status: 403 },
      );
    }

    if (channel.status === "ACTIVE") {
      const timerDeadlineMs = new Date(channel.timerDeadline).getTime();
      if (timerDeadlineMs <= Date.now()) {
        await processExpiredChannels({ channelId });
        channel = await Channel.findById(channelId).populate("questionId");

        if (!channel) {
          return NextResponse.json({ error: "Channel not found" }, { status: 404 });
        }
      }
    }

    if (channel.status !== "ACTIVE") {
      return NextResponse.json({ error: "Channel is not active" }, { status: 400 });
    }

    // Check if answer already submitted
    const existingAnswer = await Answer.findOne({ channelId });
    if (existingAnswer) {
      return NextResponse.json({ error: "Answer already submitted" }, { status: 400 });
    }

    const selectedMessageIds = Array.isArray(markedMessageIds)
      ? [...new Set(markedMessageIds.filter((id): id is string => typeof id === "string"))]
      : [];

    if (selectedMessageIds.some((id) => !Types.ObjectId.isValid(id))) {
      return NextResponse.json({ error: "One or more selected messages are invalid." }, { status: 400 });
    }

    let messages;

    if (selectedMessageIds.length > 0) {
      messages = await Message.find({
        _id: { $in: selectedMessageIds },
        channelId,
        senderId: user.id,
      }).sort({ sentAt: 1 });

      if (messages.length !== selectedMessageIds.length) {
        return NextResponse.json(
          { error: "Some selected messages could not be matched to this channel." },
          { status: 400 },
        );
      }

      // Keep the DB in sync with the messages the teacher actually selected in the UI.
      await Message.updateMany(
        { channelId, senderId: user.id },
        { $set: { isMarkedAsAnswer: false } }
      );
      await Message.updateMany(
        { _id: { $in: selectedMessageIds }, channelId, senderId: user.id },
        { $set: { isMarkedAsAnswer: true } }
      );
    } else {
      messages = await Message.find({
        channelId,
        senderId: user.id,
        isMarkedAsAnswer: true,
      }).sort({ sentAt: 1 });
    }
    
    if (messages.length === 0) {
      return NextResponse.json({ error: "Please mark at least one message as the answer before submitting." }, { status: 400 });
    }

    const question = channel.questionId as {
      _id: Types.ObjectId;
      answerFormat?: AnswerFormat;
      answerVisibility?: "PUBLIC" | "PRIVATE";
    };
    const requiredFormat = question.answerFormat ?? "ANY";
    const requiredFormats = getAnswerFormatRequirements(requiredFormat);

    // Analyze what the teacher actually marked
    const hasText = messages.some((m) => m.content && m.content.trim().length > 0);
    const hasImage = messages.some((m) => m.mediaType === "IMAGE");
    const hasVideo = messages.some((m) => m.mediaType === "VIDEO");

    const actualFormats: BaseAnswerFormat[] = [];
    if (hasText) actualFormats.push("TEXT");
    if (hasImage) actualFormats.push("PHOTO");
    if (hasVideo) actualFormats.push("VIDEO");

    const missingFormats = requiredFormats.filter((format) => {
      switch (format) {
        case "TEXT":
          return !hasText;
        case "PHOTO":
          return !hasImage;
        case "VIDEO":
          return !hasVideo;
      }
    });

    if (missingFormats.length > 0) {
      const missingLabels = missingFormats.map((format) =>
        getAnswerFormatLabel(format),
      );
      return NextResponse.json(
        {
          error:
            missingFormats.length === 1
              ? `This question requires ${missingLabels[0]}. Please mark at least one matching message as part of the answer.`
              : `This question requires all selected formats. Missing: ${missingLabels.join(", ")}.`,
        },
        { status: 400 },
      );
    }

    const detectedAnswerFormat = buildAnswerFormatFromSelection(actualFormats);
    const resolvedFormat =
      detectedAnswerFormat === "ANY" ? "TEXT" : detectedAnswerFormat;

    const content = messages.map((m) => m.content).filter(Boolean).join("\n\n");
    const mediaUrls = messages.map((m) => m.mediaUrl).filter(Boolean);

    // Based on the question, map the visibility
    const isPublic = question.answerVisibility === "PUBLIC";

    // Claim the submission on the channel first. Answer has no unique index on
    // channelId, so the findOne check above let a double tap create two
    // answers (and count twice toward the teacher's monetization threshold).
    const claim = await Channel.updateOne(
      { _id: channelId, status: "ACTIVE", answerSubmittedAt: null },
      { $set: { answerSubmittedAt: new Date() } },
    );
    if (claim.modifiedCount === 0) {
      return NextResponse.json({ error: "Answer already submitted" }, { status: 400 });
    }

    let answer;
    try {
      answer = await Answer.create({
        questionId: question._id,
        channelId,
        acceptorId: user.id,
        answerFormat: resolvedFormat,
        content,
        mediaUrls,
        isPublic,
        submittedAt: new Date(),
      });
    } catch (error) {
      await Channel.updateOne({ _id: channelId }, { $set: { answerSubmittedAt: null } });
      throw error;
    }

    // ─── Monetization Tracking (Phase 7) ─────────────────────
    // Check if teacher should unlock monetization
    const config = await getPlatformConfig();
    const threshold = config.qualificationThreshold;

    const updatedTeacher = await User.findByIdAndUpdate(
      user.id,
      { $inc: { totalAnswered: 1 } },
      { new: true },
    );

    if (
      updatedTeacher &&
      !updatedTeacher.isMonetized &&
      updatedTeacher.totalAnswered >= threshold
    ) {
      await User.findByIdAndUpdate(user.id, { isMonetized: true });

      // Notify teacher they are now monetized
      const monetizationNotif = await Notification.create({
        userId: user.id,
        type: "CHANNEL_CLOSED",
        message: `🎉 Congratulations! You've completed ${threshold} answers. You can now earn points for every answer!`,
        href: "/wallet",
      }).catch(() => null);

      if (monetizationNotif) {
        await emitNotification(user.id, monetizationNotif);
      }
    }

    // Notify the asker perfectly in real-time
    if (pusherServer) {
      await pusherServer.trigger(
        getChannelPusherName(channelId),
        ANSWER_SUBMITTED_EVENT,
        {
          answerId: answer._id.toString(),
          submittedAt: answer.submittedAt,
        }
      );
    }

    // Create notification for asker
    const askerNotif = await Notification.create({
      userId: channel.askerId,
      type: "ANSWER_SUBMITTED",
      message: "The teacher has submitted an answer to your question. Please review and rate it.",
      href: `/workspace/${channelId}`,
    }).catch(() => null);
    if (askerNotif) {
      await emitNotification(channel.askerId.toString(), askerNotif);
    }

    return NextResponse.json(answer);
  } catch (error) {
    console.error("[POST /api/answers]", error);
    return NextResponse.json(
      { error: "Failed to submit answer" },
      { status: 500 },
    );
  }
}
