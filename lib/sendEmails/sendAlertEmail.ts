import resend from "@/lib/resend/resend";
import { getResendFrom } from "@/lib/email";
import { APP_NAME } from "@/lib/constants";

interface SendAlertEmailParams {
  to: string[];
  subject: string;
  body: string;
}

// Alert text carries error messages and stack traces ("Promise<void>", user
// input), so it is escaped before it goes into the HTML.
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export async function sendAlertEmail({ to, subject, body }: SendAlertEmailParams) {
  try {
    const safeSubject = escapeHtml(subject);
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${safeSubject}</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #1a1a1a; padding: 20px; margin: 0;">
          <div style="max-width: 600px; margin: 0 auto; background: #1f1f1f; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3);">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #dc2626, #991b1b); border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                <span style="color: white; font-size: 24px; font-weight: bold;">🚨</span>
              </div>
              <h1 style="color: #fecaca; font-size: 24px; margin: 0 0 8px 0;">
                Error Alert
              </h1>
              <p style="color: #fca5a5; font-size: 16px; margin: 0;">
                ${safeSubject}
              </p>
            </div>
            
            <div style="background: #2a1a1a; border: 1px solid #dc2626; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <pre style="color: #fca5a5; font-size: 14px; margin: 0; white-space: pre-wrap; word-wrap: break-word; font-family: monospace;">${escapeHtml(body)}</pre>
            </div>
            
            <p style="color: #94a3b8; font-size: 14px; margin: 0 0 16px 0;">
              Please investigate and fix this error as soon as possible.
            </p>
            
            <p style="color: #64748b; font-size: 12px; margin: 0; text-align: center;">
              Automated alert from ${APP_NAME} Platform
            </p>
          </div>
        </body>
      </html>
    `;

    const { data, error } = await resend.emails.send({
      from: getResendFrom(),
      to,
      subject,
      html: htmlContent,
    });

    if (error) {
      console.error("Resend API error:", error);
      return { success: false, error: error.message };
    }

    console.log("Alert email sent:", data);
    return { success: true, data };
  } catch (error) {
    console.error("Exception sending alert email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}