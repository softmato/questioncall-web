import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/unified-auth";
import {
  APP_RETURN_URL,
  isAppReturnUrl,
  mintCheckoutToken,
  type CheckoutIntent,
} from "@/lib/mobile-checkout";

export const dynamic = "force-dynamic";

const INTENTS: CheckoutIntent[] = ["subscription", "course", "chapter"];

// Where the system-browser checkout lives. Same Next.js deploy, dedicated
// subdomain so Play review never sees a purchase surface inside the app.
const CHECKOUT_BASE =
  process.env.MOBILE_CHECKOUT_BASE_URL || "https://buy.questioncall.com";

/**
 * POST /api/mobile/checkout-session
 *
 * Bearer-authenticated. Mints a single-use handoff token and returns an
 * authenticated checkout URL the app opens in the system browser (Chrome Custom
 * Tab). The app never sells digital goods in-process — Play Billing compliance.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  let body: { intent?: string; ref?: string; coupon?: string; returnUrl?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const intent = body.intent as CheckoutIntent;
  if (!INTENTS.includes(intent)) {
    return NextResponse.json({ error: "BAD_INTENT" }, { status: 400 });
  }
  if ((intent === "course" || intent === "chapter") && !body.ref) {
    return NextResponse.json({ error: "REF_REQUIRED" }, { status: 400 });
  }

  const ht = mintCheckoutToken({ sub: user.id, intent, ref: body.ref });

  // Where the browser goes once checkout finishes. Older app builds send none.
  const returnUrl =
    typeof body.returnUrl === "string" && isAppReturnUrl(body.returnUrl)
      ? body.returnUrl
      : APP_RETURN_URL;
  const params = new URLSearchParams({ ht, intent, return: returnUrl });
  if (body.ref) params.set("ref", body.ref);
  // Optional subscription promo code — not part of the signed token; it is
  // re-validated and re-priced server-side on the checkout page itself.
  if (intent === "subscription" && typeof body.coupon === "string" && body.coupon.trim()) {
    params.set("coupon", body.coupon.trim().toUpperCase().slice(0, 40));
  }

  return NextResponse.json({
    url: `${CHECKOUT_BASE}/checkout?${params.toString()}`,
  });
}
