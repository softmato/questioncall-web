import { redirect } from "next/navigation";

import { AuthForm } from "@/components/shared/auth-form";
import { AuthShell } from "@/components/shared/auth-shell";
import { getDefaultPath, getSafeServerSession } from "@/lib/auth";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Student Sign Up",
  description:
    "Start your free QuestionCall student account and learn with expert answers, quizzes, and courses.",
  path: "/auth/signup/student",
  keywords: [
    "student signup",
    "QuestionCall free trial",
    "online learning Nepal",
  ],
});

export default async function StudentSignUpPage() {
  const session = await getSafeServerSession();

  if (session?.user?.role) {
    redirect(getDefaultPath(session.user.role));
  }

  return (
    <AuthShell
      description="Create a student account and land directly in the shared home feed, with your public profile available at a clean username URL."
      eyebrow="Student Portal"
      highlights={[
        "Student registration stays role-aware",
        "The shared home route is the first stop after sign-in",
        "Each account receives a clean public username path",
      ]}
      imageQuote="Start curious, stay consistent, and let every question, course, and quiz move you closer to the future you want."
      portalLabel="Student signup"
      title="Register as a student"
    >
      <AuthForm mode="register" role="STUDENT" />
    </AuthShell>
  );
}
