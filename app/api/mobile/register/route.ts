import { OAuth2Client } from "google-auth-library";
import { NextResponse } from "next/server";

import { AUTH_RATE_LIMITS, enforceAuthRateLimit } from "@/lib/auth-rate-limit";
import { createUserAccount } from "@/lib/create-user-account";
import { getGoogleAudiences } from "@/lib/google-audiences";
import { connectToDatabase } from "@/lib/mongodb";
import { generateAccessToken, generateRefreshToken } from "@/lib/mobile-auth";
import User from "@/models/User";

const googleClient = new OAuth2Client();

function isAllowedRole(value?: string): value is "STUDENT" | "TEACHER" {
  return value === "STUDENT" || value === "TEACHER";
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RegisterRequest = {
  googleIdToken?: string;
  role?: "STUDENT" | "TEACHER";
  referralCode?: string;
};

export async function POST(request: Request) {
  try {
    const body: RegisterRequest = await request.json();

    if (!body.googleIdToken || !isAllowedRole(body.role)) {
      return NextResponse.json(
        { error: "googleIdToken and role are required" },
        { status: 400 },
      );
    }

    const googleAudiences = getGoogleAudiences();

    if (!googleAudiences.length) {
      return NextResponse.json(
        { error: "Google sign-up is not configured" },
        { status: 500 },
      );
    }

    await connectToDatabase();

    const limit = await enforceAuthRateLimit({
      action: "mobile-register",
      request,
      ...AUTH_RATE_LIMITS.register,
    });
    if (!limit.ok) return limit.response;

    const ticket = await googleClient.verifyIdToken({
      idToken: body.googleIdToken,
      audience: googleAudiences,
    });

    const payload = ticket.getPayload();
    // `email_verified` must be checked explicitly: Google can issue tokens for
    // unverified addresses, and accounts are keyed on email alone.
    if (!payload?.email || payload.email_verified !== true) {
      return NextResponse.json(
        { error: "Invalid Google ID token" },
        { status: 401 },
      );
    }

    const email = payload.email.toLowerCase();
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return NextResponse.json(
        { error: "An account already exists with that email address." },
        { status: 409 },
      );
    }

    const user = await createUserAccount({
      email,
      name: payload.name || "Google User",
      role: body.role,
      referralCode: body.referralCode?.trim() || undefined,
    });

    const accessToken = generateAccessToken({
      userId: user._id.toString(),
      role: user.role,
      email: user.email,
      name: user.name,
    });

    const refreshToken = await generateRefreshToken(user._id.toString(), {
      userAgent: request.headers.get("user-agent") || undefined,
      ipAddress:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        undefined,
    });

    return NextResponse.json(
      {
        accessToken,
        refreshToken,
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          isSuspended: user.isSuspended,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Mobile Google registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
