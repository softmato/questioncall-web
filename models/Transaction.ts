import mongoose, { Schema, Document } from "mongoose";

export interface ITransaction extends Document {
  userId: mongoose.Types.ObjectId;
  type:
    | "CREDIT"
    | "DEBIT"
    | "WITHDRAWAL"
    | "SUBSCRIPTION_MANUAL"
    | "COURSE_PURCHASE"
    | "COURSE_SALE_CREDIT"
    | "CHAPTER_PURCHASE"
    | "CHAPTER_SALE_CREDIT";
  amount: number;
  status: "PENDING" | "COMPLETED" | "FAILED";
  
  // Manual Subscription Fields
  transactionId?: string;
  transactorName?: string;
  planSlug?: string;
  screenshotUrl?: string;

  reference?: string;
  gateway?: "INTERNAL" | "MANUAL" | "SOFTMATO";
  meta?: Record<string, unknown>;
  metadata?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { 
      type: String, 
      enum: [
        "CREDIT",
        "DEBIT",
        "WITHDRAWAL",
        "SUBSCRIPTION_MANUAL",
        "COURSE_PURCHASE",
        "COURSE_SALE_CREDIT",
        "CHAPTER_PURCHASE",
        "CHAPTER_SALE_CREDIT",
      ],
      required: true 
    },
    amount: { type: Number, required: true },
    status: { 
      type: String, 
      enum: ["PENDING", "COMPLETED", "FAILED"], 
      required: true 
    },
    reference: { type: String, index: true },
    gateway: { 
      type: String, 
      // 4 legacy FAILED sandbox rows still hold "ESEWA"; nothing re-saves FAILED rows.
      enum: ["INTERNAL", "MANUAL", "SOFTMATO"]
    },
    meta: { type: Schema.Types.Mixed, default: {} },
    metadata: { type: Schema.Types.Mixed, default: undefined },
    transactionId: { type: String },
    transactorName: { type: String },
    planSlug: { type: String },
    screenshotUrl: { type: String },
  },
  { timestamps: true }
);

// We deliberately avoid a strict `unique: true` index on `transactionId` here
// to allow our "Smart Typo Fix" and conflict resolution algorithms to handle 
// multiple PENDING claims appropriately.

export default mongoose.models.Transaction || mongoose.model<ITransaction>("Transaction", TransactionSchema);
