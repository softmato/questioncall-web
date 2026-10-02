import { PwaNoticesScreen } from "@/components/shared/pwa-menu-detail-screens";
import { createNoIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = createNoIndexMetadata({
  title: "Notices",
  description: "View QuestionCall notices.",
});

export default function NoticesPage() {
  return <PwaNoticesScreen />;
}
