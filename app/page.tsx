import type { Metadata } from "next";

import { redirect } from "next/navigation";

import PublicHome from "./_home/public-home";
import SignedInHome from "./_home/signed-in-home";

import { getDefaultPath, getSafeServerSession } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { createPageMetadata } from "@/lib/seo";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const publicHomeMetadata = createPageMetadata({
  title: "Learn Smarter With Expert Teachers",
  description:
    "QuestionCall helps students learn through expert answers, guided courses, live sessions, and interactive quizzes in one platform.",
  path: "/",
  keywords: [
    "QuestionCall",
    "QuestionCall Nepal",
    "online learning Nepal",
    "student help Nepal",
    "ask expert teachers online",
  ],
});

export async function generateMetadata(): Promise<Metadata> {
  const session = await getSafeServerSession();

  if (session?.user) {
    return {
      ...createPageMetadata({
        title: "Home",
        description: "Your QuestionCall home.",
        path: "/",
        index: false,
        follow: false,
      }),
      title: {
        absolute: APP_NAME,
      },
    };
  }

  return publicHomeMetadata;
}

export default async function HomePage() {
  const session = await getSafeServerSession();

  if (!session?.user) {
    return <PublicHome />;
  }

  if (session.user.role === "ADMIN") {
    redirect(getDefaultPath(session.user.role));
  }

  return <SignedInHome sessionUser={session.user} />;
}
