import mongoose from "mongoose";

import { connectToDatabase } from "@/lib/mongodb";
import Chapter from "@/models/Chapter";
import ChapterContent from "@/models/ChapterContent";
import ChapterEnrollment from "@/models/ChapterEnrollment";
import Transaction from "@/models/Transaction";
import User from "@/models/User";

export type ChapterPurchaseMetadata = {
  chapterId?: string;
  chapterName?: string;
  instructorId?: string;
  pricingModel?: string;
  grossAmount?: number;
  commissionPercent?: number;
  netAmount?: number;
  studentId?: string;
  couponCode?: string;
  discountPercentage?: number;
};

type CompleteChapterPurchaseInput = {
  transactionDocumentId: string;
  gateway: "MANUAL" | "SOFTMATO";
  metaPatch?: Record<string, unknown>;
};

export type CompleteChapterPurchaseResult = {
  alreadyCompleted: boolean;
  chapterId: string;
  chapterName: string;
  enrollmentId: string | null;
  teacherEarnings: number;
  teacherPayoutSkipped: boolean;
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function getChapterPurchaseMetadata(
  metadata: Record<string, unknown> | null | undefined,
): ChapterPurchaseMetadata {
  return {
    chapterId:
      typeof metadata?.chapterId === "string" ? metadata.chapterId : undefined,
    chapterName:
      typeof metadata?.chapterName === "string" ? metadata.chapterName : undefined,
    instructorId:
      typeof metadata?.instructorId === "string" ? metadata.instructorId : undefined,
    pricingModel:
      typeof metadata?.pricingModel === "string" ? metadata.pricingModel : undefined,
    grossAmount:
      typeof metadata?.grossAmount === "number" ? metadata.grossAmount : undefined,
    commissionPercent:
      typeof metadata?.commissionPercent === "number"
        ? metadata.commissionPercent
        : undefined,
    netAmount:
      typeof metadata?.netAmount === "number" ? metadata.netAmount : undefined,
    studentId:
      typeof metadata?.studentId === "string" ? metadata.studentId : undefined,
    couponCode:
      typeof metadata?.couponCode === "string" ? metadata.couponCode : undefined,
    discountPercentage:
      typeof metadata?.discountPercentage === "number"
        ? metadata.discountPercentage
        : undefined,
  };
}

export async function completeChapterPurchase({
  transactionDocumentId,
  gateway,
  metaPatch = {},
}: CompleteChapterPurchaseInput): Promise<CompleteChapterPurchaseResult> {
  await connectToDatabase();

  const dbSession = await mongoose.startSession();
  let result: CompleteChapterPurchaseResult | null = null;

  try {
    await dbSession.withTransaction(async () => {
      const transaction = await Transaction.findById(transactionDocumentId).session(
        dbSession,
      );

      if (!transaction) {
        throw new Error("Transaction not found.");
      }

      if (transaction.type !== "CHAPTER_PURCHASE") {
        throw new Error("Only chapter purchase transactions can be completed.");
      }

      const metadata = getChapterPurchaseMetadata(
        (transaction.metadata ?? {}) as Record<string, unknown>,
      );

      if (!metadata.chapterId) {
        throw new Error("Transaction metadata is incomplete.");
      }

      const chapter = await Chapter.findById(metadata.chapterId).session(dbSession);

      if (!chapter) {
        throw new Error("Chapter not found for this transaction.");
      }

      const instructorId = metadata.instructorId ?? chapter.instructorId?.toString();
      const [instructor, existingEnrollment, currentContentCount] = await Promise.all([
        instructorId
          ? User.findById(instructorId).select("pointBalance").session(dbSession)
          : Promise.resolve(null),
        ChapterEnrollment.findOne({
          chapterId: metadata.chapterId,
          studentId: transaction.userId,
        }).session(dbSession),
        ChapterContent.countDocuments({ chapterId: metadata.chapterId }).session(
          dbSession,
        ),
      ]);
      const teacherPayoutSkipped = !instructorId || !instructor;

      const grossAmount = roundCurrency(
        metadata.grossAmount ?? Number(chapter.price ?? transaction.amount ?? 0),
      );
      const commissionPercent = roundCurrency(metadata.commissionPercent ?? 0);
      const teacherEarnings = roundCurrency(
        metadata.netAmount ?? grossAmount * (1 - commissionPercent / 100),
      );
      const creditedTeacherEarnings = teacherPayoutSkipped ? 0 : teacherEarnings;

      if (transaction.status === "COMPLETED") {
        result = {
          alreadyCompleted: true,
          chapterId: chapter._id.toString(),
          chapterName: metadata.chapterName ?? chapter.title,
          enrollmentId: existingEnrollment?._id?.toString() ?? null,
          teacherEarnings: creditedTeacherEarnings,
          teacherPayoutSkipped,
        };
        return;
      }

      if (transaction.status !== "PENDING") {
        throw new Error("Only pending transactions can be completed.");
      }

      if (
        existingEnrollment?.accessType === "PURCHASE" &&
        existingEnrollment.transactionId &&
        existingEnrollment.transactionId.toString() !== transaction._id.toString()
      ) {
        throw new Error("This student has already purchased the chapter.");
      }

      transaction.status = "COMPLETED";
      transaction.gateway = gateway;
      transaction.metadata = {
        chapterId: chapter._id.toString(),
        chapterName: metadata.chapterName ?? chapter.title,
        instructorId,
        pricingModel: metadata.pricingModel ?? chapter.pricingModel,
        grossAmount,
        commissionPercent,
        netAmount: creditedTeacherEarnings,
        couponCode: metadata.couponCode,
        discountPercentage: metadata.discountPercentage,
      };
      transaction.meta = {
        ...(transaction.meta ?? {}),
        ...metaPatch,
        teacherPayoutSkipped,
        teacherPayoutSkipReason: teacherPayoutSkipped ? "INSTRUCTOR_NOT_FOUND" : null,
      };
      await transaction.save({ session: dbSession });

      let enrollmentId: string | null = null;

      if (existingEnrollment) {
        existingEnrollment.accessType = "PURCHASE";
        existingEnrollment.transactionId = transaction._id;
        existingEnrollment.pricePaid = grossAmount;
        existingEnrollment.totalContentCount = Math.max(
          existingEnrollment.totalContentCount ?? 0,
          currentContentCount,
        );
        await existingEnrollment.save({ session: dbSession });
        enrollmentId = existingEnrollment._id.toString();
      } else {
        const [createdEnrollment] = await ChapterEnrollment.create(
          [
            {
              chapterId: chapter._id,
              studentId: transaction.userId,
              accessType: "PURCHASE",
              transactionId: transaction._id,
              pricePaid: grossAmount,
              totalContentCount: currentContentCount,
            },
          ],
          { session: dbSession },
        );

        chapter.enrollmentCount = (chapter.enrollmentCount ?? 0) + 1;
        await chapter.save({ session: dbSession });
        enrollmentId = createdEnrollment._id.toString();
      }

      if (instructor) {
        instructor.pointBalance = roundCurrency(
          (instructor.pointBalance ?? 0) + teacherEarnings,
        );
        await instructor.save({ session: dbSession });
      }

      const existingCreditTransaction =
        instructorId && instructor
          ? await Transaction.findOne({
              userId: instructorId,
              type: "CHAPTER_SALE_CREDIT",
              "metadata.chapterId": chapter._id.toString(),
              "metadata.studentId": transaction.userId.toString(),
            }).session(dbSession)
          : null;

      if (instructorId && instructor && !existingCreditTransaction) {
        await Transaction.create(
          [
            {
              userId: instructorId,
              type: "CHAPTER_SALE_CREDIT",
              amount: teacherEarnings,
              status: "COMPLETED",
              gateway: "INTERNAL",
              metadata: {
                chapterId: chapter._id.toString(),
                chapterName: metadata.chapterName ?? chapter.title,
                pricingModel: metadata.pricingModel ?? chapter.pricingModel,
                grossAmount,
                commissionPercent,
                netAmount: teacherEarnings,
                studentId: transaction.userId.toString(),
                instructorId,
              },
            },
          ],
          { session: dbSession },
        );
      }

      result = {
        alreadyCompleted: false,
        chapterId: chapter._id.toString(),
        chapterName: metadata.chapterName ?? chapter.title,
        enrollmentId,
        teacherEarnings: creditedTeacherEarnings,
        teacherPayoutSkipped,
      };
    });
  } finally {
    await dbSession.endSession();
  }

  if (!result) {
    throw new Error("Failed to complete chapter purchase.");
  }

  return result;
}
