import { connectToDatabase } from "@/lib/mongodb";
import { getHydratedPlans, getPlatformConfig } from "@/models/PlatformConfig";
import Transaction from "@/models/Transaction";
import User from "@/models/User";
import WithdrawalRequest from "@/models/WithdrawalRequest";

export type AdminNotificationCategory = "WITHDRAWAL" | "PAYMENT" | "EXPIRY";

export type AdminNotificationItem = {
  id: string;
  category: AdminNotificationCategory;
  title: string;
  message: string;
  createdAt: string;
  href: string;
  isRead: boolean;
};

export type AdminNotificationCounts = {
  pendingWithdrawals: number;
  expiredSubscriptions: number;
  pendingManualSubscriptions: number;
  pendingCoursePurchases: number;
  unreadNotifications: number;
};

type AdminUserSeenRecord = {
  seenAdminNotifications?: string[] | null;
};

type NotificationTeacherRecord = {
  name?: string;
  email?: string;
  role?: string;
} | null;

type PendingWithdrawalRecord = {
  _id: { toString(): string };
  status?: string;
  teacherId?: NotificationTeacherRecord;
  pointsRequested: number;
  nprEquivalent: number;
  esewaNumber: string;
  createdAt: Date | string;
};

type PendingPaymentRecord = {
  _id: { toString(): string };
  type?: string;
  status?: string;
  userId?: {
    name?: string;
    email?: string;
    role?: string;
  } | null;
  planSlug?: string;
  transactionId?: string;
  metadata?: {
    courseName?: string;
  } | null;
  createdAt: Date | string;
};

type ExpiredStudentRecord = {
  _id: { toString(): string };
  name?: string;
  email?: string;
  subscriptionEnd?: Date | string | null;
  updatedAt: Date | string;
};

function toIsoString(value: Date | string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function buildWithdrawalNotificationId(requestId: { toString(): string }) {
  return `withdrawal-${requestId.toString()}`;
}

function buildPaymentNotificationId(transactionId: { toString(): string }) {
  return `payment-${transactionId.toString()}`;
}

function buildExpiredStudentNotificationId(student: ExpiredStudentRecord) {
  return `expired-student-${student._id.toString()}-${toIsoString(
    student.subscriptionEnd || student.updatedAt,
  )}`;
}

async function getSeenAdminNotificationIds(adminUserId: string) {
  const admin = (await User.findById(adminUserId)
    .select("seenAdminNotifications")
    .lean()) as AdminUserSeenRecord | null;

  return new Set(admin?.seenAdminNotifications || []);
}

export async function getAdminNotificationCounts(
  adminUserId: string,
): Promise<AdminNotificationCounts> {
  await connectToDatabase();

  const [
    seenIds,
    pendingWithdrawals,
    pendingManualSubscriptions,
    pendingCoursePurchases,
    expiredStudents,
  ] = await Promise.all([
    getSeenAdminNotificationIds(adminUserId),
    WithdrawalRequest.find({ status: "PENDING" }).select("_id").lean(),
    Transaction.find({
      type: "SUBSCRIPTION_MANUAL",
      status: "PENDING",
    })
      .select("_id")
      .lean(),
    Transaction.find({
      type: "COURSE_PURCHASE",
      status: "PENDING",
      gateway: { $ne: "SOFTMATO" },
    })
      .select("_id")
      .lean(),
    User.find({
      role: "STUDENT",
      subscriptionStatus: "EXPIRED",
    })
      .select("_id subscriptionEnd updatedAt")
      .lean(),
  ]);

  const unreadNotifications = [
    ...(pendingWithdrawals as Array<{ _id: { toString(): string } }>).map((request) =>
      buildWithdrawalNotificationId(request._id),
    ),
    ...(pendingManualSubscriptions as Array<{ _id: { toString(): string } }>).map(
      (transaction) => buildPaymentNotificationId(transaction._id),
    ),
    ...(pendingCoursePurchases as Array<{ _id: { toString(): string } }>).map((transaction) =>
      buildPaymentNotificationId(transaction._id),
    ),
    ...(expiredStudents as ExpiredStudentRecord[]).map((student) =>
      buildExpiredStudentNotificationId(student),
    ),
  ].reduce((count, notificationId) => count + (seenIds.has(notificationId) ? 0 : 1), 0);

  return {
    pendingWithdrawals: pendingWithdrawals.length,
    expiredSubscriptions: expiredStudents.length,
    pendingManualSubscriptions: pendingManualSubscriptions.length,
    pendingCoursePurchases: pendingCoursePurchases.length,
    unreadNotifications,
  };
}

export async function getAdminNotifications(
  adminUserId: string,
  { history = false }: { history?: boolean } = {},
): Promise<AdminNotificationItem[]> {
  await connectToDatabase();

  const [seenIds, config, withdrawals, transactions, expiredStudents] = await Promise.all([
    getSeenAdminNotificationIds(adminUserId),
    getPlatformConfig(),
    history
      ? WithdrawalRequest.find()
          .populate("teacherId", "name email role")
          .sort({ createdAt: -1 })
          .lean()
      : WithdrawalRequest.find({ status: "PENDING" })
          .populate("teacherId", "name email role")
          .sort({ createdAt: -1 })
          .limit(25)
          .lean(),
    history
      ? Transaction.find({ type: { $in: ["SUBSCRIPTION_MANUAL", "COURSE_PURCHASE"] } })
          .populate({ path: "userId", select: "name email role", model: User })
          .sort({ createdAt: -1 })
          .lean()
      : Transaction.find({
          type: { $in: ["SUBSCRIPTION_MANUAL", "COURSE_PURCHASE"] },
          status: "PENDING",
          gateway: { $ne: "SOFTMATO" },
        })
          .populate({ path: "userId", select: "name email role", model: User })
          .sort({ createdAt: -1 })
          .limit(25)
          .lean(),
    history
      ? User.find({ role: "STUDENT", subscriptionStatus: "EXPIRED" })
          .select("name email subscriptionEnd updatedAt")
          .sort({ updatedAt: -1 })
          .lean()
      : User.find({
          role: "STUDENT",
          subscriptionStatus: "EXPIRED",
        })
          .select("name email subscriptionEnd updatedAt")
          .sort({ updatedAt: -1 })
          .limit(25)
          .lean(),
  ]);

  const plans = getHydratedPlans(config);
  const planLabelBySlug = new Map(plans.map((plan) => [plan.slug, plan.name]));

  return [
    ...(withdrawals as unknown as PendingWithdrawalRecord[]).map((request) => {
      const id = buildWithdrawalNotificationId(request._id);

      return {
        id,
        category: "WITHDRAWAL" as const,
        title:
          request.status === "PENDING"
            ? "Withdrawal request pending"
            : `Withdrawal ${request.status?.toLowerCase() || "processed"}`,
        message: `${request.teacherId?.name || "A user"} requested ${request.pointsRequested} pts (NPR ${request.nprEquivalent}) to eSewa ${request.esewaNumber}.`,
        createdAt: toIsoString(request.createdAt),
        href: "/admin/withdrawals",
        isRead: seenIds.has(id),
      };
    }),
    ...(transactions as unknown as PendingPaymentRecord[]).map((transaction) => {
      const id = buildPaymentNotificationId(transaction._id);

      return {
        id,
        category: "PAYMENT" as const,
        title:
          transaction.status === "PENDING"
            ? "Manual payment awaiting review"
            : `Payment ${transaction.status?.toLowerCase() || "processed"}`,
        message:
          transaction.type === "COURSE_PURCHASE"
            ? `${transaction.userId?.name || "A student"} submitted a course payment for ${transaction.metadata?.courseName || "a course"}${transaction.transactionId ? ` with transaction ID ${transaction.transactionId}` : ""}.`
            : `${transaction.userId?.name || "A student"} submitted ${planLabelBySlug.get(transaction.planSlug || "") || "a subscription"} payment${transaction.transactionId ? ` with transaction ID ${transaction.transactionId}` : ""}.`,
        createdAt: toIsoString(transaction.createdAt),
        href: "/admin/transactions",
        isRead: seenIds.has(id),
      };
    }),
    ...(expiredStudents as ExpiredStudentRecord[]).map((student) => {
      const id = buildExpiredStudentNotificationId(student);

      return {
        id,
        category: "EXPIRY" as const,
        title: "Student subscription expired",
        message: `${student.name || "A student"}${student.email ? ` (${student.email})` : ""} currently needs renewal access.`,
        createdAt: toIsoString(student.subscriptionEnd || student.updatedAt),
        href: "/admin/users",
        isRead: seenIds.has(id),
      };
    }),
  ].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}
