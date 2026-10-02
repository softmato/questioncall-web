import { redirect } from "next/navigation";

import { QuizPlayerClient } from "@/components/quiz/quiz-player-client";
import { getDefaultPath, getSafeServerSession } from "@/lib/auth";
import { createNoIndexMetadata } from "@/lib/seo";

export const metadata = createNoIndexMetadata({
  title: "Quiz Session",
  description: "Private quiz session in QuestionCall.",
});

export default async function QuizSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const session = await getSafeServerSession();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  if (session.user.role !== "STUDENT") {
    redirect(getDefaultPath(session.user.role));
  }

  const { sessionId } = await params;

  return <QuizPlayerClient sessionId={sessionId} />;
}
