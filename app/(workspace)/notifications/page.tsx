import { PwaNotificationsScreen } from "@/components/shared/pwa-menu-detail-screens";
import { createNoIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = createNoIndexMetadata({
  title: "Notification Center",
  description: "View your QuestionCall notifications.",
});

export default function NotificationsPage() {
  return <PwaNotificationsScreen />;
}
