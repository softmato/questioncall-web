import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { roundPoints } from "@/lib/points";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import Transaction from "@/models/Transaction";
import User from "@/models/User";
import Notification from "@/models/Notification";
import { emitNotification } from "@/lib/pusher/pusherServer";
import { sendPushNotificationToUser } from "@/lib/push/web-push";

class CompleteWithdrawalError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CompleteWithdrawalError";
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

    const { transactionId, amountSent, adminNote } = await req.json();
    const amountSentValue = Number(amountSent);

    if (!transactionId || !amountSentValue || amountSentValue <= 0) {
      return NextResponse.json(
        { error: "transactionId and amountSent are required" },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const dbSession = await mongoose.startSession();
    let requesterId = "";

    try {
      await dbSession.withTransaction(async () => {
        const withdrawalRequest = await WithdrawalRequest.findById(id).session(
          dbSession,
        );

        if (!withdrawalRequest) {
          throw new CompleteWithdrawalError("Request not found", 404);
        }

        if (withdrawalRequest.status !== "PENDING") {
          throw new CompleteWithdrawalError(
            "This request is not in PENDING status",
            400,
          );
        }

        const requester = await User.findById(withdrawalRequest.teacherId)
          .select("role points pointBalance totalPointsWithdrawn")
          .session(dbSession);

        if (!requester) {
          throw new CompleteWithdrawalError("Requester not found", 404);
        }

        requesterId = requester._id.toString();

        if (!withdrawalRequest.pointsReserved) {
          const balanceField =
            requester.role === "STUDENT" ? "points" : "pointBalance";
          const currentBalance =
            requester.role === "STUDENT"
              ? requester.points ?? 0
              : requester.pointBalance ?? 0;

          if (currentBalance < withdrawalRequest.pointsRequested) {
            throw new CompleteWithdrawalError(
              "Requester no longer has enough points (balance may have changed)",
              400,
            );
          }

          await User.findByIdAndUpdate(
            withdrawalRequest.teacherId,
            {
              $set: {
                [balanceField]: roundPoints(
                  currentBalance - (withdrawalRequest.pointsRequested ?? 0),
                ),
              },
              $inc: {
                totalPointsWithdrawn: roundPoints(
                  withdrawalRequest.pointsRequested ?? 0,
                ),
              },
            },
            { session: dbSession },
          );
        } else {
          await User.findByIdAndUpdate(
            withdrawalRequest.teacherId,
            {
              $inc: {
                totalPointsWithdrawn: roundPoints(
                  withdrawalRequest.pointsRequested ?? 0,
                ),
              },
            },
            { session: dbSession },
          );
        }

        withdrawalRequest.status = "COMPLETED";
        withdrawalRequest.transactionId = transactionId;
        withdrawalRequest.amountSent = roundPoints(amountSentValue);
        withdrawalRequest.processedAt = new Date();
        withdrawalRequest.processedBy = session.user.id;
        withdrawalRequest.adminNote = adminNote || null;
        await withdrawalRequest.save({ session: dbSession });

        await Transaction.create(
          [
            {
              userId: requester._id,
              type: "WITHDRAWAL",
              amount: roundPoints(amountSentValue),
              status: "COMPLETED",
              transactionId,
              gateway: "MANUAL",
              reference: `WITHDRAWAL-${withdrawalRequest._id.toString()}`,
              metadata: {
                requestId: withdrawalRequest._id.toString(),
                pointsRequested: roundPoints(withdrawalRequest.pointsRequested ?? 0),
                nprEquivalent: roundPoints(withdrawalRequest.nprEquivalent ?? amountSentValue),
                esewaNumber: withdrawalRequest.esewaNumber,
                requesterRole: requester.role,
                adminNote: adminNote || null,
              },
            },
          ],
          { session: dbSession },
        );
      });
    } finally {
      await dbSession.endSession();
    }

    if (requesterId) {
      const withdrawalMessage = `Your withdrawal of NPR ${roundPoints(amountSentValue)} has been processed. eSewa Txn ID: ${transactionId}`;

      const notif = await Notification.create({
        userId: requesterId,
        type: "PAYMENT",
        message: withdrawalMessage,
        href: "/wallet",
        isRead: false,
      }).catch(() => null);

      if (notif) {
        await emitNotification(requesterId, notif).catch(() => {});
      }

      void sendPushNotificationToUser(requesterId, {
        type: "PAYMENT",
        message: withdrawalMessage,
        href: "/wallet",
      }).catch(console.error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof CompleteWithdrawalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("[POST /api/admin/withdrawals/complete]", error);
    return NextResponse.json(
      { error: "Failed to complete withdrawal" },
      { status: 500 },
    );
  }
}
