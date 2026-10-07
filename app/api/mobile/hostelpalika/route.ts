import { NextResponse } from "next/server";

import { AUTH_RATE_LIMITS, enforceAuthRateLimit } from "@/lib/auth-rate-limit";
import { createUserAccount } from "@/lib/create-user-account";
import { connectToDatabase } from "@/lib/mongodb";
import { generateAccessToken, generateRefreshToken } from "@/lib/mobile-auth";
import User from "@/models/User";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOSTELPALIKA_URL = (process.env.HOSTELPALIKA_URL?.trim() || "https://hostelpalika.com").replace(
  /\/$/,
  "",
);

type HostelPalikaIdentity = {
  clickId: string;
  user: { email: string; id: string; name: string; phone: string | null };
};

/** Server to server, with the secret HostelPalika also expects on its webhooks. */
async function callHostelPalika<T>(path: string, body: unknown, secret: string) {
  const response = await fetch(`${HOSTELPALIKA_URL}/api/v1/integrations/questioncall/${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-questioncall-secret": secret },
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as { data?: T };
  return json.data ?? null;
}

/**
 * POST /api/mobile/hostelpalika
 *
 * Sign in a student who tapped QuestionCall inside HostelPalika, without a
 * second login — the way ChatGPT opens inside Viber. They arrive with
 * `?hp_code=`, a single-use code HostelPalika minted for them; we trade it with
 * HostelPalika's backend for their verified email, then sign that account in,
 * or create it as a STUDENT. The code alone proves nothing: only the trade does,
 * and it needs `HOSTELPALIKA_SECRET`, which never leaves this server.
 *
 * Same response as `/mobile/login`.
 */
export async function POST(request: Request) {
  try {
    const secret = process.env.HOSTELPALIKA_SECRET?.trim();

    if (!secret) {
      return NextResponse.json(
        { error: "HostelPalika sign-in is not configured" },
        { status: 503 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code.trim() : "";

    if (!code || code.length > 200) {
      return NextResponse.json({ error: "code is required" }, { status: 400 });
    }

    await connectToDatabase();

    const limit = await enforceAuthRateLimit({
      action: "mobile-hostelpalika",
      request,
      ...AUTH_RATE_LIMITS.login,
    });
    if (!limit.ok) return limit.response;

    const identity = await callHostelPalika<HostelPalikaIdentity>("sso", { code }, secret);

    if (!identity?.user.email) {
      return NextResponse.json(
        { error: "This sign-in link has expired or was already used." },
        { status: 401 },
      );
    }

    const email = identity.user.email.toLowerCase().trim();
    let user = await User.findOne({ email });
    let created = false;

    if (!user) {
      user = await createUserAccount({
        email,
        name: identity.user.name || "Student",
        role: "STUDENT",
      });
      created = true;
    }

    // Same gates as `/mobile/login`: a deleted account recovers through Forgot
    // Password, and a suspended one stays out.
    if (user.isDeleted) {
      return NextResponse.json(
        {
          error:
            "This account is scheduled for deletion. To recover it, reset your password using 'Forgot Password'.",
        },
        { status: 403 },
      );
    }

    if (user.isSuspended) {
      return NextResponse.json({ error: "Account suspended" }, { status: 403 });
    }

    if (created) {
      // HostelPalika's referral report counts a signup only when we say so.
      void callHostelPalika("conversion", { clickId: identity.clickId }, secret).catch(
        () => undefined,
      );
    }

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
      { status: created ? 201 : 200 },
    );
  } catch (error) {
    console.error("HostelPalika sign-in error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
