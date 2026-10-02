import { PwaNotificationSettingsScreen } from "@/components/shared/pwa-menu-detail-screens";
import { createNoIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = createNoIndexMetadata({
  title: "Notification Settings",
  description: "Manage QuestionCall notification settings.",
});

export default function NotificationSettingsPage() {
  return <PwaNotificationSettingsScreen />;
}
