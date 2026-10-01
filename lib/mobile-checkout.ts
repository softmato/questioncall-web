import crypto from "crypto";
import jwt from "jsonwebtoken";

import { JWT_SECRET as SECRET } from "@/lib/env";
import { connectToDatabase } from "@/lib/mongodb";
import { getSiteUrl } from "@/lib/site-url";
import UsedCheckoutToken from "@/models/UsedCheckoutToken";

// The mobile app's access tokens are signed with NEXTAUTH_SECRET (see
// lib/mobile-auth.ts). Reuse the SAME secret so handoff tokens live in one trust
// domain — do NOT introduce a second payment-specific secret.

export const HANDOFF_TTL_SECONDS = 5 * 60;

/** The phone app's deep link, which its Custom Tab intercepts. */
export const APP_RETURN_URL = "questioncall://payment/return";

/**
 * Where a finished checkout may send the browser (app/lib/web-checkout.ts): the
 * phone app's deep link, or the PWA's own page, since its popup can only hand
 * back a URL on its own origin. Anything else is refused: the success pages
 * pass this straight to location.assign().
 */
export function isAppReturnUrl(url: string) {
  return url === APP_RETURN_URL || url === `${getSiteUrl()}/app/payment/return`;
}

export type CheckoutIntent = "subscription" | "course" | "chapter";

export interface CheckoutHandoffPayload {
  sub: string; // userId
  intent: CheckoutIntent;
  ref?: string; // courseId / chapterId / plan slug
  jti: string; // nonce for single-use enforcement
}

/**
 * Mint a short-lived (5 min), single-use token that proves "this user started
 * checkout". Never put the long-lived access token in a browser URL/history.
 */
export function mintCheckoutToken(
  p: Omit<CheckoutHandoffPayload, "jti">,
): string {
  const payload: CheckoutHandoffPayload = { ...p, jti: crypto.randomUUID() };
  return jwt.sign(payload, SECRET, { expiresIn: HANDOFF_TTL_SECONDS });
}

export function verifyCheckoutToken(token: string): CheckoutHandoffPayload {
  return jwt.verify(token, SECRET) as CheckoutHandoffPayload;
}

/**
 * Enforce single-use by recording the token's `jti`. Returns false if the token
 * has already been redeemed (replay). The record auto-expires via TTL once the
 * token would itself be expired, so the collection never grows unbounded.
 */
export async function consumeCheckoutToken(
  payload: CheckoutHandoffPayload,
): Promise<boolean> {
  await connectToDatabase();
  try {
    await UsedCheckoutToken.create({
      jti: payload.jti,
      userId: payload.sub,
      expiresAt: new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000),
    });
    return true;
  } catch (error) {
    // Duplicate key on `jti` means the token was already consumed.
    if ((error as { code?: number })?.code === 11000) return false;
    throw error;
  }
}
