import { NextResponse } from "next/server";

import { getWebPushPublicKey, isWebPushConfigured } from "@/lib/push/web-push";
import { getAuthenticatedUser } from "@/lib/unified-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Session cookie (website) or Bearer token (the installed app at /app), like /push/subscribe.
export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isWebPushConfigured()) {
    return NextResponse.json(
      { error: "Push notifications are not configured yet." },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { publicKey: getWebPushPublicKey() },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
