import { redirect } from "next/navigation";

import { AuthForm } from "@/components/shared/auth-form";
import { AuthShell } from "@/components/shared/auth-shell";
import { getDefaultPath, getSafeServerSession } from "@/lib/auth";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Teacher Sign Up",
  description:
    "Create your free QuestionCall teacher account and start answering, teaching, and earning online.",
  path: "/auth/signup/teacher",
  keywords: [
    "teacher signup",
    "teach online Nepal",
    "QuestionCall teacher account",
  ],
});

export default async function TeacherSignUpPage() {
  const session = await getSafeServerSession();

  if (session?.user?.role) {
    redirect(getDefaultPath(session.user.role));
  }

  return (
    <AuthShell
      description="Create a teacher account and land directly in the shared home feed, while your public profile becomes reachable at your username path."
      eyebrow="Teacher Portal"
      highlights={[
        "Teacher registration stays role-aware",
        "The home feed replaces the old dashboard-first flow",
        "Profiles now follow the public /username route style",
      ]}
      imageQuote="Teach with clarity, earn with confidence, and build a reputation students remember long after the answer is solved."
      portalLabel="Teacher signup"
      title="Register as a teacher"
    >
      <AuthForm mode="register" role="TEACHER" />
    </AuthShell>
  );
}
