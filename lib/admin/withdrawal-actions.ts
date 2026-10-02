import mongoose from "mongoose";

import { connectToDatabase } from "@/lib/mongodb";
import { roundPoints } from "@/lib/points";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import Transaction from "@/models/Transaction";
import User from "@/models/User";
import Notification from "@/models/Notification";
import { emitNotification } from "@/lib/pusher/pusherServer";
import { sendPushNotificationToUser } from "@/lib/push/web-push";

export type WithdrawalActionResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * Complete a pending withdrawal: debit the requester's balance (unless already
 * reserved), record a WITHDRAWAL transaction, and notify them. Mirrors
 * `POST /api/admin/withdrawals/[id]/complete`.
 */
export async function completeWithdrawal(args: {
  id: string;
  adminId: string;
  transactionId: string;
  amountSent: number;
  adminNote?: string | null;
}): Promise<WithdrawalActionResult> {
  const { id, adminId, transactionId } = args;
  const amountSentValue = Number(args.amountSent);
  const adminNote = args.adminNote ?? null;

  if (!transactionId || !amountSentValue || amountSentValue <= 0) {
    return {
      ok: false,
      error: "transactionId and amountSent are required",
      status: 400,
    };
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, error: "Request not found", status: 404 };
  }

  await connectToDatabase();

  const dbSession = await mongoose.startSession();
  let requesterId = "";
  let actionError: { error: string; status: number } | null = null;

  try {
    await dbSession.withTransaction(async () => {
      const withdrawalRequest = await WithdrawalRequest.findById(id).session(dbSession);

      if (!withdrawalRequest) {
        actionError = { error: "Request not found", status: 404 };
        throw new Error("abort");
      }
      if (withdrawalRequest.status !== "PENDING") {
        actionError = { error: "This request is not in PENDING status", status: 400 };
        throw new Error("abort");
      }

      const requester = await User.findById(withdrawalRequest.teacherId)
        .select("role points pointBalance totalPointsWithdrawn")
        .session(dbSession);

      if (!requester) {
        actionError = { error: "Requester not found", status: 404 };
        throw new Error("abort");
      }

      requesterId = requester._id.toString();

      if (!withdrawalRequest.pointsReserved) {
        const balanceField = requester.role === "STUDENT" ? "points" : "pointBalance";
        const currentBalance =
          requester.role === "STUDENT"
            ? requester.points ?? 0
            : requester.pointBalance ?? 0;

        if (currentBalance < withdrawalRequest.pointsRequested) {
          actionError = {
            error: "Requester no longer has enough points (balance may have changed)",
            status: 400,
          };
          throw new Error("abort");
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
              totalPointsWithdrawn: roundPoints(withdrawalRequest.pointsRequested ?? 0),
            },
          },
          { session: dbSession },
        );
      } else {
        await User.findByIdAndUpdate(
          withdrawalRequest.teacherId,
          {
            $inc: {
              totalPointsWithdrawn: roundPoints(withdrawalRequest.pointsRequested ?? 0),
            },
          },
          { session: dbSession },
        );
      }

      withdrawalRequest.status = "COMPLETED";
      withdrawalRequest.transactionId = transactionId;
      withdrawalRequest.amountSent = roundPoints(amountSentValue);
      withdrawalRequest.processedAt = new Date();
      withdrawalRequest.processedBy = adminId;
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
              nprEquivalent: roundPoints(
                withdrawalRequest.nprEquivalent ?? amountSentValue,
              ),
              esewaNumber: withdrawalRequest.esewaNumber,
              requesterRole: requester.role,
              adminNote: adminNote || null,
            },
          },
        ],
        { session: dbSession },
      );
    });
  } catch (err) {
    if (actionError) {
      const e: { error: string; status: number } = actionError;
      return { ok: false, error: e.error, status: e.status };
    }
    throw err;
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

  return { ok: true };
}

/**
 * Reject a pending withdrawal: refund reserved points (if any) and notify.
 * Mirrors `POST /api/admin/withdrawals/[id]/reject`.
 */
export async function rejectWithdrawal(args: {
  id: string;
  adminId: string;
  adminNote?: string | null;
}): Promise<WithdrawalActionResult> {
  const { id, adminId } = args;
  const adminNote = args.adminNote ?? null;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, error: "Request not found or not pending", status: 404 };
  }

  await connectToDatabase();

  const dbSession = await mongoose.startSession();
  let requesterId = "";
  let requestedPoints = 0;
  let actionError: { error: string; status: number } | null = null;

  try {
    await dbSession.withTransaction(async () => {
      const withdrawalRequest = await WithdrawalRequest.findById(id).session(dbSession);

      if (!withdrawalRequest || withdrawalRequest.status !== "PENDING") {
        actionError = { error: "Request not found or not pending", status: 404 };
        throw new Error("abort");
      }

      requesterId = withdrawalRequest.teacherId.toString();
      requestedPoints = withdrawalRequest.pointsRequested;

      if (withdrawalRequest.pointsReserved) {
        const requester = await User.findById(withdrawalRequest.teacherId)
          .select("role")
          .session(dbSession);

        if (!requester) {
          actionError = { error: "Requester not found", status: 404 };
          throw new Error("abort");
        }

        const balanceField = requester.role === "STUDENT" ? "points" : "pointBalance";
        await User.findByIdAndUpdate(
          withdrawalRequest.teacherId,
          { $inc: { [balanceField]: withdrawalRequest.pointsRequested } },
          { session: dbSession },
        );
      }

      withdrawalRequest.status = "REJECTED";
      withdrawalRequest.processedAt = new Date();
      withdrawalRequest.processedBy = adminId;
      withdrawalRequest.adminNote = adminNote || null;
      await withdrawalRequest.save({ session: dbSession });
    });
  } catch (err) {
    if (actionError) {
      const e: { error: string; status: number } = actionError;
      return { ok: false, error: e.error, status: e.status };
    }
    throw err;
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

  return { ok: true };
}
