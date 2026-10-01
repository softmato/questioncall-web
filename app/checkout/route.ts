import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { isValidObjectId } from "mongoose";

import { JWT_SECRET } from "@/lib/env";
import { connectToDatabase } from "@/lib/mongodb";
import {
  isAppReturnUrl,
  verifyCheckoutToken,
  consumeCheckoutToken,
  type CheckoutHandoffPayload,
} from "@/lib/mobile-checkout";
import User from "@/models/User";
import Course from "@/models/Course";
import Chapter from "@/models/Chapter";

export const dynamic = "force-dynamic";

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30d — matches NextAuth default
const RETURN_COOKIE = "qc_checkout_return";

// NextAuth uses the "__Secure-" prefixed cookie whenever it runs over HTTPS.
const useSecureCookies =
  (process.env.NEXTAUTH_URL ?? "").startsWith("https://") ||
  process.env.NODE_ENV === "production";
const sessionCookieName = `${useSecureCookies ? "__Secure-" : ""}next-auth.session-token`;

function redirectTo(req: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, req.url));
}

/**
 * GET /checkout?ht=...&intent=...&ref=...&return=...
 *
 * Entry point for the mobile → web checkout hand-off. Verifies the single-use
 * handoff token, establishes a real NextAuth (JWT-strategy) web session for that
 * user, then forwards to the EXISTING web checkout surface. No payment UI is
 * rebuilt here — we only authenticate the browser and route it.
 */
export async function GET(req: NextRequest) {
  const ht = req.nextUrl.searchParams.get("ht");
  const returnUrl = req.nextUrl.searchParams.get("return");

  if (!ht) {
    return redirectTo(req, "/?checkout=invalid");
  }

  // 1. Verify the handoff token.
  let payload: CheckoutHandoffPayload;
  try {
    payload = verifyCheckoutToken(ht);
  } catch {
    return redirectTo(req, "/?checkout=expired");
  }

  // 2. Enforce single-use (replay protection within the 5-min window).
  const fresh = await consumeCheckoutToken(payload);
  if (!fresh) {
    return redirectTo(req, "/?checkout=used");
  }

  // 3. Load the user so the minted session carries role/username/etc.
  await connectToDatabase();
  const user = await User.findById(payload.sub)
    .select("name email username role isSuspended")
    .lean<{
      _id: unknown;
      name?: string;
      email?: string;
      username?: string;
      role: "STUDENT" | "TEACHER" | "ADMIN";
      isSuspended?: boolean;
    } | null>();

  if (!user || user.isSuspended) {
    return redirectTo(req, "/?checkout=invalid");
  }

  const userId = String(user._id);

  // 4. Resolve the destination on the existing web checkout surface.
  let target: string;
  if (payload.intent === "subscription") {
    // Dedicated, inlined-form membership checkout for the app hand-off (no
    // modal, no sandbox auto-pay). The main-website `/subscription/payment`
    // flow is intentionally left as-is. Defaults to the 1-month plan when no
    // ref is given so it never drops into the workspace "configure" screen.
    target = payload.ref
      ? `/subscription/checkout?plan=${encodeURIComponent(payload.ref)}`
      : "/subscription/checkout";
    // Optional promo code passthrough — checkout re-validates it server-side.
    const couponParam = req.nextUrl.searchParams.get("coupon");
    if (couponParam?.trim()) {
      target += `${target.includes("?") ? "&" : "?"}coupon=${encodeURIComponent(couponParam.trim())}`;
    }
  } else if (payload.intent === "course") {
    const slug = await resolveSlug(Course as unknown as SlugModel, payload.ref);
    if (!slug) return redirectTo(req, "/courses?checkout=notfound");
    target = `/courses/${slug}/buy`;
  } else {
    const slug = await resolveSlug(
      Chapter as unknown as SlugModel,
      payload.ref,
    );
    if (!slug) return redirectTo(req, "/courses?checkout=notfound");
    target = `/chapters/${slug}/buy`;
  }

  // Forward the app's theme so the checkout matches the app (light/dark) rather
  // than the device/browser. Unknown values are ignored (page defaults apply).
  const themeParam = req.nextUrl.searchParams.get("theme");
  if (themeParam === "light" || themeParam === "dark") {
    target += `${target.includes("?") ? "&" : "?"}theme=${themeParam}`;
  }

  // 5. Mint a NextAuth-compatible session token (JWT strategy). Using NextAuth's
  //    own encode() guarantees getToken()/getServerSession() can decode it.
  const sessionToken = await encode({
    token: {
      id: userId,
      sub: userId,
      role: user.role,
      username: user.username,
      name: user.name,
      email: user.email,
    },
    secret: JWT_SECRET,
    maxAge: SESSION_MAX_AGE,
  });

  const res = redirectTo(req, target);
  res.cookies.set(sessionCookieName, sessionToken, {
    httpOnly: true,
    secure: useSecureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  // 6. Remember we came from the app so the success/cancel pages can deep-link
  //    back. Not httpOnly on purpose: it only holds a public app return URL, and
  //    the client-side success/cancel pages must read it. Allowlisted, because
  //    those pages hand it to location.assign() (a javascript: URL would run).
  if (returnUrl && isAppReturnUrl(returnUrl)) {
    res.cookies.set(RETURN_COOKIE, returnUrl, {
      httpOnly: false,
      secure: useSecureCookies,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 60,
    });
  }

  return res;
}

type SlugQuery = {
  select(field: string): { lean(): Promise<{ slug?: string } | null> };
};
type SlugModel = {
  findById(id: string): SlugQuery;
  findOne(filter: Record<string, unknown>): SlugQuery;
};

/** Accept either a Mongo _id or a slug as `ref` and return the canonical slug. */
async function resolveSlug(
  model: SlugModel,
  ref?: string,
): Promise<string | null> {
  if (!ref) return null;
  const doc = isValidObjectId(ref)
    ? await model.findById(ref).select("slug").lean()
    : await model.findOne({ slug: ref }).select("slug").lean();
  return doc?.slug ?? null;
}
