import { PwaChangePasswordScreen } from "@/components/shared/pwa-menu-detail-screens";
import { createNoIndexMetadata } from "@/lib/seo";

export const metadata = createNoIndexMetadata({
  title: "Change Password",
  description: "Change your QuestionCall password.",
});

export default function ChangePasswordPage() {
  return <PwaChangePasswordScreen />;
}
