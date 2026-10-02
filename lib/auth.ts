import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import type { NextAuthOptions, Session } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { cookies } from "next/headers";
import { cache } from "react";

import { AUTH_RATE_LIMITS, enforceAuthRateLimit } from "@/lib/auth-rate-limit";
import { normalizeCallSettings, type UserCallSettings } from "@/lib/call-settings";
import { JWT_SECRET } from "@/lib/env";
import { connectToDatabase } from "@/lib/mongodb";
import { getProfilePath, getUserHandle } from "@/lib/user-paths";
import { generateUniqueUsername } from "@/lib/user-directory";
import User, { type UserRecord, type UserRole } from "@/models/User";
import Transaction from "@/models/Transaction";
import Referral from "@/models/Referral";
import Notification from "@/models/Notification";
import { getPlatformConfig } from "@/models/PlatformConfig";
import { emitNotification } from "@/lib/pusher/pusherServer";
import { sendGreetingEmail } from "@/lib/sendEmails/sendGreetingEmail";
import { getSiteUrl } from "@/lib/site-url";
import { APP_NAME } from "@/lib/constants";

const defaultPathByRole: Record<UserRole, string> = {
  STUDENT: "/",
  TEACHER: "/",
  ADMIN: "/admin/settings",
};

export function getDefaultPath(role?: UserRole) {
  if (!role) {
    return "/";
  }

  return defaultPathByRole[role];
}

export { getProfilePath, getUserHandle };

// cache(): the root layout, the page and generateMetadata all ask in one render.
export const getSafeServerSession = cache(async () => {
  try {
    return await getServerSession(authOptions);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("decryption operation failed") ||
        error.name === "JWEDecryptionFailed")
    ) {
      return null;
    }

    throw error;
  }
});

type WorkspaceUserRecord = Pick<
  UserRecord,
  | "name"
  | "email"
  | "username"
  | "role"
  | "userImage"
  | "callSettings"
  | "teacherModeVerified"
  | "totalAnswered"
>;

export async function getWorkspaceUser(sessionUser: Session["user"]) {
  await connectToDatabase();

  const dbUser = await User.findById(sessionUser.id)
    .select("name email username role userImage callSettings teacherModeVerified totalAnswered dailyAnswersCount lastAnsweredDate")
    .lean<WorkspaceUserRecord & { dailyAnswersCount?: number, lastAnsweredDate?: Date } | null>();

  let activeDailyAnswersCount = 0;
  if (dbUser?.lastAnsweredDate) {
    const now = new Date();
    const lastAns = new Date(dbUser.lastAnsweredDate);
    if (
      lastAns.getFullYear() === now.getFullYear() &&
      lastAns.getMonth() === now.getMonth() &&
      lastAns.getDate() === now.getDate()
    ) {
      activeDailyAnswersCount = dbUser.dailyAnswersCount || 0;
    }
  }

  return {
    id: sessionUser.id,
    name: dbUser?.name ?? sessionUser.name ?? "",
    email: dbUser?.email ?? sessionUser.email ?? "",
    username: dbUser?.username ?? sessionUser.username ?? "",
    role: dbUser?.role ?? sessionUser.role,
    teacherModeVerified: dbUser?.teacherModeVerified ?? false,
    totalAnswered: dbUser?.totalAnswered ?? 0,
    userImage: dbUser?.userImage ?? "",
    callSettings: normalizeCallSettings(
      dbUser?.callSettings as Partial<UserCallSettings> | null | undefined,
    ),
    dailyAnswersCount: activeDailyAnswersCount,
  };
}

export const authOptions: NextAuthOptions = {
  secret: JWT_SECRET,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/signin",
  },
  providers: [
    CredentialsProvider({
      name: "Email and Password",
      credentials: {
        email: {
          label: "Email",
          type: "email",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },
      async authorize(
        credentials: { email: string; password: string } | undefined,
        req,
      ): Promise<
        {
          id: string;
          name: string;
          email: string;
          role: UserRole;
          username?: string;
          isMasterAdmin?: boolean;
        } | null
      > {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;

        if (!email || !password) {
          return null;
        }

        await connectToDatabase();

        // The phone's login is throttled; this form was an unlimited
        // password-guessing endpoint. NextAuth passes plain header values.
        const headers = new Headers();
        for (const [name, value] of Object.entries(req?.headers ?? {})) {
          if (typeof value === "string") headers.set(name, value);
        }
        const limit = await enforceAuthRateLimit({
          action: "web-login",
          request: new Request("http://localhost/api/auth/callback/credentials", { headers }),
          email,
          ...AUTH_RATE_LIMITS.login,
        });
        if (!limit.ok) {
          throw new Error("Too many sign-in attempts. Please wait a few minutes and try again.");
        }

        const user = await User.findOne({ email }).select("+passwordHash");

        if (!user?.passwordHash) {
          return null;
        }

        const passwordMatches = await bcrypt.compare(password, user.passwordHash);

        if (!passwordMatches) {
          return null;
        }

        // Same rules as the phone's login (app/api/mobile/login).
        if (user.isDeleted) {
          throw new Error(
            "This account is scheduled for deletion. To recover it, reset your password using \"Forgot password\".",
          );
        }
        if (user.isSuspended) {
          throw new Error("This account is suspended.");
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          username: user.username,
          isMasterAdmin: user.isMasterAdmin,
        };
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        const email = user.email?.toLowerCase();
        if (!email) return false;

        // Google can issue tokens for unverified addresses. Since accounts are
        // matched by email alone below, an unverified one would let a stranger
        // sign into someone else's account.
        if ((profile as { email_verified?: boolean } | undefined)?.email_verified !== true) {
          return false;
        }

        await connectToDatabase();
        const existingUser = await User.findOne({ email });

        if (!existingUser) {
          // New user registration via Google
          const name = user.name || "Google User";
          const username = await generateUniqueUsername({ email, name });
          const userOwnReferralCode = `REF-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
          const siteUrl = getSiteUrl();
          
          // Get role and referral from cookies (set by AuthForm). The cookie is
          // client-controlled: anything but TEACHER must become STUDENT, or a
          // hand-set "ADMIN" would create an admin account.
          const cookieStore = await cookies();
          const role: UserRole =
            cookieStore.get("pending-role")?.value === "TEACHER" ? "TEACHER" : "STUDENT";
          const referralCode = cookieStore.get("pending-referral")?.value;

          let referrerUser = null;
          let refereeBonus = 0;
          let referrerBonus = 0;
          let referralCodeUsed = null;

          if (referralCode) {
            const config = await getPlatformConfig();
            if (config.referralEnabled) {
              referrerUser = await User.findOne({ 
                referralCode: referralCode.toUpperCase().trim(),
                isSuspended: false
              });
              if (referrerUser && referrerUser.email !== email) {
                refereeBonus = config.referralBonusQuestions || 1;
                referrerBonus = config.referrerBonusQuestions || 3;
                referralCodeUsed = referrerUser.referralCode;
              }
            }
          }

          const newUser = await User.create({
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
          });

          if (referrerUser) {
            referrerUser.bonusQuestions = (referrerUser.bonusQuestions || 0) + referrerBonus;
            if (!referrerUser.referralHistory) referrerUser.referralHistory = [];
            referrerUser.referralHistory.push({
              referredUserId: newUser._id,
              pointsEarned: referrerBonus,
              date: new Date()
            });
            await referrerUser.save();

            await Referral.create({
              referrerId: referrerUser._id,
              refereeId: newUser._id,
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
              `Someone just joined ${APP_NAME} using your referral link. You have been awarded ${referrerBonus} bonus questions permanently to your account!`
            ).catch(console.error);
          }

          if (role === "STUDENT") {
            await Transaction.create({
              userId: newUser._id,
              type: "SUBSCRIPTION_MANUAL",
              amount: 0,
              status: "COMPLETED",
              planSlug: "free",
              transactionId: `TRIAL_${newUser._id}`,
              transactorName: name,
            });
          }

          if (referrerUser && refereeBonus > 0) {
            const refereeNotification = await Notification.create({
              userId: newUser._id,
              type: "SYSTEM",
              message: `🎉 Welcome! You received ${refereeBonus} bonus questions for signing up with a referral link!`,
              href: "/subscription",
              isRead: false,
            }).catch(() => null);

            if (refereeNotification) {
              await emitNotification(newUser._id.toString(), refereeNotification).catch(() => {});
            }

            void sendGreetingEmail(
              email,
              name,
              `Welcome to ${APP_NAME}! (+ Bonus Questions 🎉)`,
              siteUrl,
              `We're excited to have you on board! Since you signed up with a friend's referral link, you have been awarded ${refereeBonus} bonus questions to ask for free. Explore courses, ask questions, and start your learning journey today.`
            ).catch(console.error);
          } else {
            void sendGreetingEmail(
              email,
              name,
              `Welcome to ${APP_NAME}! Your account has been created successfully.`,
              siteUrl,
              "We're excited to have you on board! Explore courses, ask questions, and start your learning journey today."
            ).catch(console.error);
          }

          // Pass the new user details to the JWT callback
          user.id = newUser.id;
          (user as any).role = newUser.role;
          (user as any).username = newUser.username;
        } else {
          // Existing user. Suspended and deleted accounts are refused, as on the
          // phone; the sign-in page explains the AccessDenied it lands on.
          if (existingUser.isSuspended || existingUser.isDeleted) {
            return false;
          }
          user.id = existingUser.id;
          (user as any).role = existingUser.role;
          (user as any).username = existingUser.username;
          (user as any).isMasterAdmin = existingUser.isMasterAdmin;
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "google") {
          // For Google users, we need to ensure the token has the MongoDB ID and Role
          // We look up the user because modifications in the signIn callback 
          // don't always propagate to the jwt callback in NextAuth v4.
          await connectToDatabase();
          const dbUser = await User.findOne({ email: user.email });
          if (dbUser) {
            token.id = dbUser.id;
            token.role = dbUser.role;
            token.username = dbUser.username;
            token.isMasterAdmin = dbUser.isMasterAdmin;
          }
        } else {
          // For Credentials provider, the user object already has the correct data
          token.id = user.id;
          token.role = (user as any).role;
          token.username = (user as any).username;
          token.isMasterAdmin =
            "isMasterAdmin" in user && typeof (user as any).isMasterAdmin === "boolean"
              ? (user as any).isMasterAdmin
              : undefined;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id && token.role) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
        session.user.username =
          typeof token.username === "string" ? token.username : undefined;
        session.user.isMasterAdmin = token.isMasterAdmin as boolean;
      }

      return session;
    },
  },
};
