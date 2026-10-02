import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import Notification from "@/models/Notification";
import User from "@/models/User";
import { emitNotification } from "@/lib/pusher/pusherServer";
import { sendPushNotificationToUser } from "@/lib/push/web-push";

class RejectWithdrawalError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "RejectWithdrawalError";
    this.status = status;
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { adminNote } = await req.json();

    await connectToDatabase();

    const dbSession = await mongoose.startSession();
    let requesterId = "";
    let requestedPoints = 0;

    try {
      await dbSession.withTransaction(async () => {
        const withdrawalRequest = await WithdrawalRequest.findById(id).session(
          dbSession,
        );

        if (!withdrawalRequest || withdrawalRequest.status !== "PENDING") {
          throw new RejectWithdrawalError("Request not found or not pending", 404);
        }

        requesterId = withdrawalRequest.teacherId.toString();
        requestedPoints = withdrawalRequest.pointsRequested;

        if (withdrawalRequest.pointsReserved) {
          const requester = await User.findById(withdrawalRequest.teacherId)
            .select("role")
            .session(dbSession);

          if (!requester) {
            throw new RejectWithdrawalError("Requester not found", 404);
          }

          const balanceField =
            requester.role === "STUDENT" ? "points" : "pointBalance";

          await User.findByIdAndUpdate(
            withdrawalRequest.teacherId,
            {
              $inc: { [balanceField]: withdrawalRequest.pointsRequested },
            },
            { session: dbSession },
          );
        }

        withdrawalRequest.status = "REJECTED";
        withdrawalRequest.processedAt = new Date();
        withdrawalRequest.processedBy = session.user.id;
        withdrawalRequest.adminNote = adminNote || null;
        await withdrawalRequest.save({ session: dbSession });
      });
    } finally {
      await dbSession.endSession();
    }

    if (requesterId) {
      const rejectMessage = `Your withdrawal request of ${requestedPoints} pts was rejected. Reason: ${adminNote || "No reason given."}`;

      const notif = await Notification.create({
        userId: requesterId,
        type: "PAYMENT",
        message: rejectMessage,
        href: "/wallet",
        isRead: false,
      }).catch(() => null);

      if (notif) {
        await emitNotification(requesterId, notif).catch(() => {});
      }

      void sendPushNotificationToUser(requesterId, {
        type: "PAYMENT",
        message: rejectMessage,
        href: "/wallet",
      }).catch(console.error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RejectWithdrawalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("[POST /api/admin/withdrawals/reject]", error);
    return NextResponse.json(
      { error: "Failed to reject withdrawal" },
      { status: 500 },
    );
  }
}
