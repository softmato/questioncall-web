import crypto from "crypto";

import { APP_NAME } from "@/lib/constants";
import { emitNotification } from "@/lib/pusher/pusherServer";
import { sendGreetingEmail } from "@/lib/sendEmails/sendGreetingEmail";
import { getSiteUrl } from "@/lib/site-url";
import { generateUniqueUsername } from "@/lib/user-directory";
import Notification from "@/models/Notification";
import { getPlatformConfig } from "@/models/PlatformConfig";
import Referral from "@/models/Referral";
import Transaction from "@/models/Transaction";
import User from "@/models/User";
import type { UserRecord } from "@/models/User";

type ReferrerUser = {
  _id: { toString(): string };
  email: string;
  name: string;
  bonusQuestions?: number;
  referralHistory?: Array<{
    referredUserId: { toString(): string };
    pointsEarned: number;
    date: Date;
  }>;
  referralCode?: string | null;
  save: () => Promise<unknown>;
};

/**
 * A new QuestionCall account with its referral bonus, free-plan row and welcome
 * email. Callers vouch for `email` first — Google's verified address, or the
 * verified one HostelPalika hands over in its sign-in exchange.
 */
export async function createUserAccount(params: {
  email: string;
  name: string;
  role: "STUDENT" | "TEACHER";
  referralCode?: string;
}) {
  const { email, name, role, referralCode } = params;
  const username = await generateUniqueUsername({ email, name });
  const userOwnReferralCode = `REF-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const siteUrl = getSiteUrl();

  let referrerUser: ReferrerUser | null = null;
  let refereeBonus = 0;
  let referrerBonus = 0;
  let referralCodeUsed: string | null = null;

  if (referralCode) {
    const config = await getPlatformConfig();
    if (config.referralEnabled) {
      referrerUser = await User.findOne({
        referralCode: referralCode.toUpperCase().trim(),
        isSuspended: false,
      });

      if (referrerUser && referrerUser.email !== email) {
        refereeBonus = config.referralBonusQuestions || 1;
        referrerBonus = config.referrerBonusQuestions || 3;
        referralCodeUsed = referrerUser.referralCode ?? null;
      } else {
        referrerUser = null;
      }
    }
  }

  const user = await User.create({
    name,
    email,
    username,
    role,
    referralCode: userOwnReferralCode,
    bonusQuestions: refereeBonus,
    referredBy: referrerUser ? referrerUser._id : null,
    points: 0,
    pointBalance: 0,
    totalAnswered: 0,
    isMonetized: false,
    overallScore: 0,
    overallRatingSum: 0,
    overallRatingCount: 0,
  }) as unknown as UserRecord & { _id: { toString(): string } };

  if (referrerUser) {
    referrerUser.bonusQuestions = (referrerUser.bonusQuestions || 0) + referrerBonus;
    if (!referrerUser.referralHistory) referrerUser.referralHistory = [];
    referrerUser.referralHistory.push({
      referredUserId: user._id,
      pointsEarned: referrerBonus,
      date: new Date(),
    });
    await referrerUser.save();

    await Referral.create({
      referrerId: referrerUser._id,
      refereeId: user._id,
      referralCode: referralCodeUsed,
      bonusAwarded: referrerBonus,
      status: "COMPLETED",
    });

    const notification = await Notification.create({
      userId: referrerUser._id,
      type: "SYSTEM",
      message: `🎉 Someone joined using your referral link! You've been awarded ${referrerBonus} bonus questions!`,
      href: "/subscription",
      isRead: false,
    }).catch(() => null);

    if (notification) {
      await emitNotification(referrerUser._id.toString(), notification).catch(() => {});
    }

    void sendGreetingEmail(
      referrerUser.email,
      referrerUser.name,
      "You Earned Bonus Questions! 🎉",
      `${siteUrl}/subscription`,
      `Someone just joined ${APP_NAME} using your referral link. You have been awarded ${referrerBonus} bonus questions permanently to your account!`,
    ).catch(console.error);
  }

  if (role === "STUDENT") {
    await Transaction.create({
      userId: user._id,
      type: "SUBSCRIPTION_MANUAL",
      amount: 0,
      status: "COMPLETED",
      planSlug: "free",
      transactionId: `TRIAL_${user._id}`,
      transactorName: name,
    });
  }

  if (referrerUser && refereeBonus > 0) {
    const refereeNotification = await Notification.create({
      userId: user._id,
      type: "SYSTEM",
      message: `🎉 Welcome! You received ${refereeBonus} bonus questions for signing up with a referral link!`,
      href: "/subscription",
      isRead: false,
    }).catch(() => null);

    if (refereeNotification) {
      await emitNotification(user._id.toString(), refereeNotification).catch(() => {});
    }

    void sendGreetingEmail(
      email,
      name,
      `Welcome to ${APP_NAME}! (+ Bonus Questions 🎉)`,
      siteUrl,
      `We're excited to have you on board! Since you signed up with a friend's referral link, you have been awarded ${refereeBonus} bonus questions to ask for free. Explore courses, ask questions, and start your learning journey today.`,
    ).catch(console.error);
  } else {
    void sendGreetingEmail(
      email,
      name,
      `Welcome to ${APP_NAME}! Your account has been created successfully.`,
      siteUrl,
      "We're excited to have you on board! Explore courses, ask questions, and start your learning journey today.",
    ).catch(console.error);
  }

  return user;
}
