import { redirect } from "next/navigation";

import { getSafeServerSession, getWorkspaceUser } from "@/lib/auth";
import { createNoIndexMetadata } from "@/lib/seo";
import { getLeaderboardPath } from "@/lib/user-paths";

export const metadata = createNoIndexMetadata({
  title: "Leaderboard",
  description: "See rankings and leaderboard activity on QuestionCall.",
});

export default async function LeaderboardPage() {
  const session = await getSafeServerSession();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  const user = await getWorkspaceUser(session.user);

  redirect(getLeaderboardPath(user));
}
