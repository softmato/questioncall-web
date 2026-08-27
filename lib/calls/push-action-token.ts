import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Single-purpose tokens that let a call push be acted on from a process with no
 * credentials.
 *
 * Why these exist: declining an incoming call from the Android CallStyle
 * notification happens in a BroadcastReceiver on a cold process — no React, no
 * JS runtime, and therefore no access to the bearer token the app normally
 * signs requests with. Without something like this, Decline could only silence
 * the callee's own device: the caller kept ringing until the RINGING timeout,
 * and the ring-fallback tier re-pushed the same call seconds later because the
 * server still believed nobody had answered.
 *
 * The shape of the guarantee, deliberately narrow:
 *   - bound to ONE call session and ONE user, so a leaked token cannot be
 *     replayed against another call or another account;
 *   - short-lived, because it only has to outlive a 30s ring;
 *   - good for exactly one action, so possession confers nothing else. The
 *     route that accepts it still refuses anything that is not a RINGING call
 *     the holder is the callee of.
 *
 * It is NOT a session credential and must never be treated as one — do not
 * accept it anywhere except the push-action routes it is minted for.
 */

const TOKEN_TTL_MS = 5 * 60 * 1000;
const VERSION = "v1";

function getSecret(): string {
  // Same secret the mobile bearer tokens are signed with. Deliberately not a
  // new env var: one more secret to provision in three EAS environments is one
  // more thing to be quietly missing in production.
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "NEXTAUTH_SECRET is required to mint call push-action tokens",
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export type CallPushAction = "reject";

function buildPayload(
  action: CallPushAction,
  callSessionId: string,
  userId: string,
  expiresAt: number,
): string {
  return [VERSION, action, callSessionId, userId, String(expiresAt)].join(".");
}

/**
 * Mint a token authorising `userId` to run `action` on `callSessionId`.
 *
 * Returns null rather than throwing when the secret is missing: a call that
 * cannot mint a decline token must still ring. The client falls back to the old
 * behaviour (silence locally, let the session time out) when the field is
 * absent, so a misconfigured environment degrades instead of failing the call.
 */
export function createCallPushActionToken(
  action: CallPushAction,
  callSessionId: string,
  userId: string,
): string | null {
  try {
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    const payload = buildPayload(action, callSessionId, userId, expiresAt);
    return `${expiresAt}.${sign(payload)}`;
  } catch (err) {
    console.warn("[call-push-token] Could not mint token:", err);
    return null;
  }
}

export type VerifyResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "malformed" | "expired" | "invalid" };

/**
 * Verify a token against the call and user it must have been minted for.
 *
 * The caller supplies the expected userId (the session's callee), so this
 * confirms the binding rather than trusting an identity carried in the token —
 * there is no claim in here that the server does not already know.
 */
export function verifyCallPushActionToken(
  token: string,
  action: CallPushAction,
  callSessionId: string,
  expectedUserId: string,
): VerifyResult {
  const separator = token.indexOf(".");
  if (separator <= 0) return { ok: false, reason: "malformed" };

  const expiresAt = Number(token.slice(0, separator));
  const signature = token.slice(separator + 1);
  if (!Number.isFinite(expiresAt) || !signature) {
    return { ok: false, reason: "malformed" };
  }

  if (Date.now() > expiresAt) return { ok: false, reason: "expired" };

  let expected: string;
  try {
    expected = sign(buildPayload(action, callSessionId, expectedUserId, expiresAt));
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const provided = Buffer.from(signature);
  const candidate = Buffer.from(expected);
  if (provided.length !== candidate.length) {
    return { ok: false, reason: "invalid" };
  }
  if (!timingSafeEqual(provided, candidate)) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, userId: expectedUserId };
}
