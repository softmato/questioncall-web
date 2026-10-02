import { redirect } from "next/navigation";

import { AuthShell } from "@/components/shared/auth-shell";
import { getDefaultPath, getSafeServerSession } from "@/lib/auth";
import { createNoIndexMetadata } from "@/lib/seo";
import { ForgotPasswordClient } from "./forgot-password-client";

export const metadata = createNoIndexMetadata({
  title: "Forgot Password",
  description: "Reset your password for QuestionCall.",
});

export default async function ForgotPasswordPage() {
  const session = await getSafeServerSession();

  if (session?.user?.role) {
    redirect(getDefaultPath(session.user.role));
  }

  return (
    <AuthShell
      description="Enter your registered email address to receive a one-time verification code and set a new password."
      eyebrow="Account Recovery"
      highlights={[
        "Secure one-time verification code",
        "Valid for 10 minutes",
        "Quick and easy password reset",
      ]}
      imageQuote="Don't worry, it happens to the best of us. Let's get you back into your account so you can continue learning and sharing."
      portalLabel="Account Recovery"
      title="Reset your password"
    >
      <ForgotPasswordClient />
    </AuthShell>
  );
}
