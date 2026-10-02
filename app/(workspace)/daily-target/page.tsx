import { PwaDailyTargetScreen } from "@/components/shared/pwa-menu-detail-screens";
import { getSafeServerSession, getWorkspaceUser } from "@/lib/auth";
import { createNoIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = createNoIndexMetadata({
  title: "Daily Target",
  description: "Track your QuestionCall daily answers.",
});

export default async function DailyTargetPage() {
  const session = await getSafeServerSession();
  const user = session?.user ? await getWorkspaceUser(session.user) : null;

  return <PwaDailyTargetScreen dailyAnswersCount={user?.dailyAnswersCount ?? 0} />;
}
