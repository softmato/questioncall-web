import { PwaMenuScreen } from "@/components/shared/pwa-menu-screen";
import { getSafeServerSession, getWorkspaceUser } from "@/lib/auth";
import { createNoIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = createNoIndexMetadata({
  title: "Menu",
  description: "Open your QuestionCall app menu.",
});

export default async function MenuPage() {
  const session = await getSafeServerSession();
  const workspaceUser = session?.user
    ? await getWorkspaceUser(session.user)
    : null;

  return (
    <PwaMenuScreen dailyAnswersCount={workspaceUser?.dailyAnswersCount ?? 0} />
  );
}
