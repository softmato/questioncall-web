import mongoose from "mongoose";
import Channel from "@/models/Channel";
import AntiCheatAlert from "@/models/AntiCheatAlert";
import Notification from "@/models/Notification";
import { getPlatformConfig } from "@/models/PlatformConfig";
import { emitNotification } from "@/lib/pusher/pusherServer";

export async function checkTeacherStudentPattern(teacherId: string, studentId: string) {
  try {
    const config = await getPlatformConfig();
    if (!config.antiCheatEnabled) return;

    const threshold = config.antiCheatConsecutiveThreshold || 5;

    // Fetch the last N accepted channels by this teacher
    const recentChannels = await Channel.find({ acceptorId: new mongoose.Types.ObjectId(teacherId) })
      .sort({ createdAt: -1 })
      .limit(threshold)
      .select("askerId");

    // If they haven't accepted enough questions to hit the threshold, ignore
    if (recentChannels.length < threshold) return;

    // Check if ALL of these last N questions are from the same student
    const allFromSameStudent = recentChannels.every(ch => ch.askerId.toString() === studentId.toString());

    if (allFromSameStudent) {
      // Create Anti-Cheat Alert
      await AntiCheatAlert.create({
        teacherId,
        studentId,
        consecutiveCount: threshold,
        status: "WARNING"
      });

      const suspensionDays = config.antiCheatSuspensionDays || 3;
      const warningMsg = `⚠️ You have accepted ${threshold} consecutive questions from the same student. Please accept questions from other students as well. Continued pattern may result in a ${suspensionDays}-day account suspension.`;

      // Notify the teacher
      const notification = await Notification.create({
        userId: teacherId,
        type: "SYSTEM",
        message: warningMsg,
        href: "/feed",
      });

      await emitNotification(teacherId, notification);
    }
  } catch (error) {
    console.error("Error in checkTeacherStudentPattern:", error);
  }
}
