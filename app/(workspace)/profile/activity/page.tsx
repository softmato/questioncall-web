import { PwaActivityScreen } from "@/components/shared/pwa-menu-detail-screens";
import { getSafeServerSession, getWorkspaceUser } from "@/lib/auth";
import { createNoIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = createNoIndexMetadata({
  title: "My Activity",
  description: "View your QuestionCall activity.",
});

export default async function ActivityPage() {
  const session = await getSafeServerSession();
  const user = session?.user ? await getWorkspaceUser(session.user) : null;

  return (
    <PwaActivityScreen
      dailyAnswersCount={user?.dailyAnswersCount ?? 0}
      totalAnswered={user?.totalAnswered ?? 0}
    />
  );
}
