import { NextResponse } from "next/server";
import mongoose from "mongoose";

import { getAuthenticatedUser } from "@/lib/unified-auth";
import { connectToDatabase } from "@/lib/mongodb";
import Question from "@/models/Question";
import Answer from "@/models/Answer";
import Channel from "@/models/Channel";
import Message from "@/models/Message";
import CallSession from "@/models/CallSession";
import PeerComment from "@/models/PeerComment";
import PendingReactionNotification from "@/models/PendingReactionNotification";
import User from "@/models/User";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);

    if (!authenticatedUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid question ID" }, { status: 400 });
    }

    await connectToDatabase();

    const question = await Question.findById(id);

    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    if (question.askerId.toString() !== authenticatedUser.id) {
      return NextResponse.json(
        { error: "You can only delete your own questions" },
        { status: 403 }
      );
    }

    // A live channel means a teacher is mid-session on this question. Deleting
    // it would destroy the session under them (and the record their rating and
    // points came from), so the asker has to close it first.
    const activeChannel = await Channel.exists({
      questionId: id,
      status: "ACTIVE",
    });

    if (activeChannel) {
      return NextResponse.json(
        {
          error:
            "This question has an active session. Close the channel before deleting it.",
        },
        { status: 409 }
      );
    }

    const channelIds = (
      await Channel.find({ questionId: id }).select("_id").lean()
    ).map((channel) => channel._id);

    const dbSession = await mongoose.startSession();

    try {
      await dbSession.withTransaction(async () => {
        // Everything that hangs off the question, deepest first, so a failure
        // partway through never leaves the question pointing at half-gone data.
        if (channelIds.length > 0) {
          await Message.deleteMany({ channelId: { $in: channelIds } }).session(
            dbSession
          );
          await CallSession.deleteMany({
            channelId: { $in: channelIds },
          }).session(dbSession);
        }

        await Answer.deleteMany({ questionId: id }).session(dbSession);
        await PeerComment.deleteMany({ questionId: id }).session(dbSession);
        await PendingReactionNotification.deleteMany({
          questionId: id,
        }).session(dbSession);
        await Channel.deleteMany({ questionId: id }).session(dbSession);
        await Question.deleteOne({ _id: id }).session(dbSession);

        // Atomic decrement clamped at 0. A read-modify-save() here would race
        // with concurrent counter updates and would run full-document
        // validation, so any pre-existing invalid field on the user (e.g. a
        // legacy out-of-range overallScore) would fail the delete.
        await User.updateOne({ _id: authenticatedUser.id }, [
          {
            $set: {
              totalAsked: {
                $max: [0, { $subtract: [{ $ifNull: ["$totalAsked", 0] }, 1] }],
              },
              questionsAsked: {
                $max: [
                  0,
                  { $subtract: [{ $ifNull: ["$questionsAsked", 0] }, 1] },
                ],
              },
            },
          },
        ]).session(dbSession);
      });
    } finally {
      await dbSession.endSession();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/questions/[id]]", error);
    return NextResponse.json(
      { error: "Failed to delete question" },
      { status: 500 }
    );
  }
}
