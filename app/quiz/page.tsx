import Link from "next/link";
import { redirect } from "next/navigation";

import { CourseHeader } from "@/components/course/CourseHeader";
import { QuizHubClient } from "@/components/quiz/quiz-hub-client";
import { getDefaultPath, getSafeServerSession } from "@/lib/auth";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Quiz Practice",
  description:
    "Practice interactive quizzes on QuestionCall and sharpen your skills with guided learning.",
  path: "/quiz",
  keywords: [
    "quiz practice",
    "QuestionCall quiz",
    "online quiz Nepal",
  ],
});

export default async function QuizHubPage() {
  const session = await getSafeServerSession();

  if (!session?.user) {
    return (
      <div className="min-h-svh bg-[#f6f8fb] text-foreground dark:bg-background">
        <CourseHeader user={null} />
        <div className="px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-8 rounded-[32px] border border-border bg-background p-6 shadow-sm sm:p-8">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
              Quiz Practice
            </p>
            <h1 className="text-4xl font-bold tracking-tight">
              Test what you know before the real exam does.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">
              QuestionCall quizzes help students practice faster with guided question sets,
              timed sessions, and progress that connects back to the rest of the platform.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-muted/20 p-5">
              <h2 className="font-semibold">Timed practice</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Simulate pressure and improve confidence with focused quiz sessions.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/20 p-5">
              <h2 className="font-semibold">Smart learning loop</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Move between courses, questions, and quizzes without leaving your workflow.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/20 p-5">
              <h2 className="font-semibold">Built for students</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Practice regularly, earn money, and keep building subject confidence.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/auth/signup/student"
              className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Start free as a student
            </Link>
            <Link
              href="/auth/signin"
              className="inline-flex items-center justify-center rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              Sign in to continue
            </Link>
          </div>
        </div>
        </div>
      </div>
    );
  }

  if (session.user.role !== "STUDENT") {
    redirect(getDefaultPath(session.user.role));
  }

  return <QuizHubClient />;
}
