import { Types } from "mongoose";

import { connectToDatabase } from "@/lib/mongodb";
import User from "@/models/User";
import Channel from "@/models/Channel";
import Question from "@/models/Question";
import Notification from "@/models/Notification";
import {
  emitNotification,
  emitChannelStatusUpdate,
} from "@/lib/pusher/pusherServer";

export type ToggleSuspensionResult =
  | { ok: true; isSuspended: boolean; message: string }
  | { ok: false; error: string; status: number };

/**
 * Toggle a user's suspension with all the platform side-effects.
 *
 * Mirrors the behaviour of the web admin suspend route
 * (`web/app/api/admin/users/[id]/suspend/route.ts`): suspending a TEACHER also
 * force-expires their active channels and reopens the affected questions,
 * notifying each asker. Shared so the mobile admin endpoint stays in lock-step
 * with the web one.
 */
export async function toggleUserSuspension(
  userId: string,
): Promise<ToggleSuspensionResult> {
  await connectToDatabase();

  const userToSuspend = Types.ObjectId.isValid(userId) ? await User.findById(userId) : null;
  if (!userToSuspend) {
    return { ok: false, error: "User not found", status: 404 };
  }

  const willSuspend = !userToSuspend.isSuspended;
  userToSuspend.isSuspended = willSuspend;
  await userToSuspend.save();

  // If a teacher is being suspended, force-expire their active channels.
  if (willSuspend && userToSuspend.role === "TEACHER") {
    const activeChannels = await Channel.find({
      acceptorId: userToSuspend._id,
      status: "ACTIVE",
    });

    for (const channel of activeChannels) {
      channel.status = "EXPIRED";
      await channel.save();

      await emitChannelStatusUpdate(channel._id.toString(), "EXPIRED").catch(
        console.error,
      );

      const question = await Question.findById(channel.questionId);
      if (question && question.status === "ACCEPTED") {
        question.status = "OPEN";
        question.resetCount = (question.resetCount || 0) + 1;
        await question.save();

        const notif = await Notification.create({
          userId: question.askerId,
          type: "QUESTION_RESET",
          message:
            "The teacher assigned to your question was suspended. Your question has been reopened.",
        }).catch(() => null);

        if (notif) {
          await emitNotification(question.askerId.toString(), notif).catch(
            console.error,
          );
        }
      }
    }
  }

  return {
    ok: true,
    isSuspended: willSuspend,
    message: `User ${willSuspend ? "suspended" : "unsuspended"} successfully`,
  };
}
