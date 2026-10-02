import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import DeveloperConfig from "@/models/DeveloperConfig";
import { sendAlertEmail } from "@/lib/sendEmails/sendAlertEmail";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await connectToDatabase();
    const config = await DeveloperConfig.findOne();
    if (!config?.emails.length) {
      return NextResponse.json(
        { error: "No developer emails configured" },
        { status: 400 }
      );
    }

const subject = "🧪 Test Alert from QuestionCall Platform";

    const message = `This is a test alert to verify that developer email notifications are working correctly.

If you received this email, the error alerting system is properly configured.

---
Automated test from QuestionCall Platform`;

    const result = await sendAlertEmail({
      to: config.emails,
      subject,
      body: message,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to send email" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error sending test alert:", error);
    return NextResponse.json(
      { error: "Failed to send test alert" },
      { status: 500 }
    );
  }
}