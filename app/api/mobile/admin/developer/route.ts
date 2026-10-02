import { NextResponse } from "next/server";

import { requireMobileAdmin } from "@/lib/mobile-admin-auth";
import { connectToDatabase } from "@/lib/mongodb";
import DeveloperConfig from "@/models/DeveloperConfig";
import { sendAlertEmail } from "@/lib/sendEmails/sendAlertEmail";

export const dynamic = "force-dynamic";

/** GET /api/mobile/admin/developer — error-alert config. */
export async function GET(request: Request) {
  const gate = await requireMobileAdmin(request);
  if (!gate.ok) return gate.response;

  try {
    await connectToDatabase();
    const config = await DeveloperConfig.findOne();
    return NextResponse.json({
      emails: config?.emails || [],
      errorThreshold: config?.errorThreshold || 4,
      enabled: config?.enabled ?? true,
      lastAlertSent: config?.lastAlertSent?.toISOString() || null,
    });
  } catch (error) {
    console.error("GET /api/mobile/admin/developer error:", error);
    return NextResponse.json({ error: "Failed to fetch config" }, { status: 500 });
  }
}

/**
 * PATCH /api/mobile/admin/developer — mirrors the web actions.
 * Body: { action: "addEmail" | "removeEmail", email }
 *     | { action: "setThreshold", threshold }
 *     | { action: "setEnabled", enabled }
 */
export async function PATCH(request: Request) {
  const gate = await requireMobileAdmin(request);
  if (!gate.ok) return gate.response;

  try {
    const body = await request.json();
    const { action } = body;

    await connectToDatabase();
    let config = await DeveloperConfig.findOne();
    if (!config) config = await DeveloperConfig.create({});

    if (action === "addEmail") {
      const email = String(body.email || "");
      if (!email.includes("@")) {
        return NextResponse.json({ error: "Invalid email" }, { status: 400 });
      }
      if (!config.emails.includes(email.toLowerCase())) {
        config.emails.push(email.toLowerCase());
        await config.save();
      }
      return NextResponse.json({ success: true });
    }

    if (action === "removeEmail") {
      config.emails = config.emails.filter((e: string) => e !== body.email);
      await config.save();
      return NextResponse.json({ success: true });
    }

    if (action === "setThreshold") {
      const threshold = Number(body.threshold);
      if (!Number.isFinite(threshold) || threshold < 1 || threshold > 100) {
        return NextResponse.json({ error: "Invalid threshold" }, { status: 400 });
      }
      config.errorThreshold = threshold;
      await config.save();
      return NextResponse.json({ success: true });
    }

    if (action === "setEnabled") {
      config.enabled = !!body.enabled;
      await config.save();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("PATCH /api/mobile/admin/developer error:", error);
    return NextResponse.json({ error: "Failed to update config" }, { status: 500 });
  }
}

/** POST /api/mobile/admin/developer — send a test alert email to all devs. */
export async function POST(request: Request) {
  const gate = await requireMobileAdmin(request);
  if (!gate.ok) return gate.response;

  try {
    await connectToDatabase();
    const config = await DeveloperConfig.findOne();
    if (!config?.emails.length) {
      return NextResponse.json(
        { error: "No developer emails configured" },
        { status: 400 },
      );
    }

    const result = await sendAlertEmail({
      to: config.emails,
      subject: "🧪 Test Alert from QuestionCall Platform",
      body: `This is a test alert to verify that developer email notifications are working correctly.

If you received this email, the error alerting system is properly configured.

---
Automated test from QuestionCall Platform`,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to send email" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/mobile/admin/developer error:", error);
    return NextResponse.json({ error: "Failed to send test alert" }, { status: 500 });
  }
}
