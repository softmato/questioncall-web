import { PwaWithdrawScreen } from "@/components/shared/pwa-menu-detail-screens";
import { createNoIndexMetadata } from "@/lib/seo";

export const metadata = createNoIndexMetadata({
  title: "Withdraw",
  description: "Open your QuestionCall wallet withdrawal screen.",
});

export default function WithdrawPage() {
  return <PwaWithdrawScreen />;
}
