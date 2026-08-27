import { NextResponse } from "next/server";

import { flushDueReactionNotifications } from "@/lib/reaction-notifications";
import { validateCronRequest } from "@/lib/cron-auth";

/**
 * Delivers reaction notifications whose reactor has gone quiet.
 *
 * Reaction pushes are deferred (see lib/reaction-notifications) so repeat taps
 * collapse into one. The react route already flushes opportunistically, which
 * covers any question with traffic; this exists so a reaction that lands right
 * before the site goes quiet still gets delivered.
 *
 * Suggested schedule: every minute. Nothing breaks at a longer interval — the
 * notification simply arrives later.
 */
export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  try {
    const authResult = validateCronRequest(request);
    if (!authResult.ok) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status },
      );
    }

    const result = await flushDueReactionNotifications();

    return NextResponse.json({
      message: `Sent ${result.sentCount} reaction notification(s), skipped ${result.skippedCount} withdrawn.`,
      ...result,
    });
  } catch (error) {
    console.error("[POST /api/cron/flush-reaction-notifications]", error);
    return NextResponse.json(
      { error: "Failed to flush reaction notifications" },
      { status: 500 },
    );
  }
}
