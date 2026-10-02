import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import User from "@/models/User";
import Channel from "@/models/Channel";
import Question from "@/models/Question";
import Notification from "@/models/Notification";
import { emitNotification, pusherServer, emitChannelStatusUpdate } from "@/lib/pusher/pusherServer";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await connectToDatabase();

    const userToSuspend = await User.findById(id);
    if (!userToSuspend) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Toggle suspension
    const willSuspend = !userToSuspend.isSuspended;
    userToSuspend.isSuspended = willSuspend;
    await userToSuspend.save();

    // If teacher is being suspended, forcefully expire their active channels
    if (willSuspend && userToSuspend.role === "TEACHER") {
      const activeChannels = await Channel.find({
        acceptorId: userToSuspend._id,
        status: "ACTIVE",
      });

      for (const channel of activeChannels) {
        // Mark channel EXPIRED
        channel.status = "EXPIRED";
        await channel.save();

        // Broadcast to channel so users see it expired
        await emitChannelStatusUpdate(channel._id.toString(), "EXPIRED").catch(console.error);

        // Reset the question back to the feed
        const question = await Question.findById(channel.questionId);
        if (question && question.status === "ACCEPTED") {
          question.status = "OPEN";
          question.resetCount = (question.resetCount || 0) + 1;
          await question.save();

          // Notify the asker
          const notif = await Notification.create({
            userId: question.askerId,
            type: "QUESTION_RESET",
            message: "The teacher assigned to your question was suspended. Your question has been reopened.",
          }).catch(() => null);

          if (notif) {
            await emitNotification(question.askerId.toString(), notif).catch(console.error);
          }
        }
      }
    }

    return NextResponse.json({
      message: `User ${willSuspend ? "suspended" : "unsuspended"} successfully`,
      isSuspended: willSuspend,
    });
  } catch (error) {
    console.error("User Suspension Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
