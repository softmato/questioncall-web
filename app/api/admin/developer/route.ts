import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import DeveloperConfig, {
  IDeveloperConfig,
} from "@/models/DeveloperConfig";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await connectToDatabase();
    const config = await DeveloperConfig.findOne();
    return NextResponse.json({
      emails: config?.emails || [],
      errorThreshold: config?.errorThreshold || 4,
      enabled: config?.enabled ?? true,
      lastAlertSent: config?.lastAlertSent?.toISOString() || null,
    });
  } catch (error) {
    console.error("Error fetching developer config:", error);
    return NextResponse.json(
      { error: "Failed to fetch config" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await connectToDatabase();
    const body = await request.json();
    const { action } = body;

    let config = await DeveloperConfig.findOne();
    if (!config) {
      config = await DeveloperConfig.create({});
    }

    if (action === "addEmail") {
      const { email } = body;
      if (!email || !email.includes("@")) {
        return NextResponse.json(
          { error: "Invalid email" },
          { status: 400 }
        );
      }
      if (!config.emails.includes(email.toLowerCase())) {
        config.emails.push(email.toLowerCase());
        await config.save();
      }
      return NextResponse.json({ success: true });
    }

    if (action === "removeEmail") {
      const { email } = body;
      config.emails = config.emails.filter((e: string) => e !== email);
      await config.save();
      return NextResponse.json({ success: true });
    }

    if (action === "setThreshold") {
      const { threshold } = body;
      if (typeof threshold !== "number" || threshold < 1 || threshold > 100) {
        return NextResponse.json(
          { error: "Invalid threshold" },
          { status: 400 }
        );
      }
      config.errorThreshold = threshold;
      await config.save();
      return NextResponse.json({ success: true });
    }

    if (action === "setEnabled") {
      const { enabled } = body;
      config.enabled = !!enabled;
      await config.save();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error updating developer config:", error);
    return NextResponse.json(
      { error: "Failed to update config" },
      { status: 500 }
    );
  }
}