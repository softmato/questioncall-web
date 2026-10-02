import ErrorLog from "@/models/ErrorLog";
import DeveloperConfig from "@/models/DeveloperConfig";
import { sendAlertEmail as deliverAlertEmail } from "@/lib/sendEmails/sendAlertEmail";

function generateErrorKey(message: string, stack?: string): string {
  const base = message.slice(0, 100);
  if (stack) {
    const stackMatch = stack.split("\n")[0].slice(0, 50);
    return `${base}:${stackMatch}`.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-:]/g, "");
  }
  return base.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export async function logError(
  message: string,
  options?: {
    stack?: string;
    userId?: string;
    context?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const errorKey = generateErrorKey(message, options?.stack);

    let errorLog = await ErrorLog.findOne({ errorKey, resolved: false });

    if (errorLog) {
      errorLog.count += 1;
      errorLog.lastOccurred = new Date();
      await errorLog.save();
    } else {
      errorLog = await ErrorLog.create({
        errorKey,
        message,
        stack: options?.stack,
        count: 1,
        firstOccurred: new Date(),
        lastOccurred: new Date(),
        resolved: false,
      });
    }

    await checkThresholdAndAlert(errorLog._id.toString());
  } catch (err) {
    console.error("Failed to log error:", err);
  }
}

async function checkThresholdAndAlert(errorLogId: string): Promise<void> {
  try {
    const devConfig = await DeveloperConfig.findOne();
    if (!devConfig?.enabled || !devConfig.emails.length) {
      return;
    }

    const threshold = devConfig.errorThreshold || 4;
    const errorLog = await ErrorLog.findById(errorLogId);

    if (!errorLog || errorLog.count < threshold || errorLog.count % threshold !== 0) {
      return;
    }

    const timeSinceLastAlert = errorLog.lastOccurred.getTime() - (devConfig.lastAlertSent?.getTime() || 0);
    const MIN_ALERT_INTERVAL = 15 * 60 * 1000;

    if (timeSinceLastAlert < MIN_ALERT_INTERVAL) {
      return;
    }

    await sendAlertEmail(errorLog, devConfig.emails);

    devConfig.lastAlertSent = new Date();
    await devConfig.save();
  } catch (err) {
    console.error("Error checking threshold:", err);
  }
}

async function sendAlertEmail(
  errorLog: {
    errorKey: string;
    message: string;
    stack?: string;
    count: number;
    firstOccurred: Date;
    lastOccurred: Date;
  },
  emails: string[]
): Promise<void> {
  const subject = `🔴 Error Alert: "${errorLog.errorKey}" occurred ${errorLog.count} times`;
  const body = `Error has occurred ${errorLog.count} times on the platform.

First occurrence: ${errorLog.firstOccurred.toISOString()}
Last occurrence: ${errorLog.lastOccurred.toISOString()}

Error message: ${errorLog.message}

${errorLog.stack ? `Stack trace:\n${errorLog.stack}` : ""}

Please investigate and fix this issue.

---
Automated alert from QuestionCall Platform`;

  // Sent directly: this runs on the server, where a relative fetch() to our
  // own API cannot resolve, so the alert used to fail every time.
  const result = await deliverAlertEmail({ to: emails, subject, body });
  if (!result.success) {
    console.error("Failed to send alert email:", result.error);
  }
}

export async function markErrorResolved(errorKey: string): Promise<void> {
  try {
    const errorLog = await ErrorLog.findOne({ errorKey, resolved: false });
    if (errorLog) {
      errorLog.resolved = true;
      errorLog.resolvedAt = new Date();
      await errorLog.save();
    }
  } catch (err) {
    console.error("Failed to mark error resolved:", err);
  }
}