import { redirect } from "next/navigation";
import { getSafeServerSession } from "@/lib/auth";
import { createNoIndexMetadata } from "@/lib/seo";
import { WalletClient } from "./wallet-client";

export const dynamic = "force-dynamic";
export const metadata = createNoIndexMetadata({
  title: "Wallet",
  description: "Manage your QuestionCall wallet and transaction history.",
});

export default async function WalletPage() {
  const session = await getSafeServerSession();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  if (session.user.role === "ADMIN") {
    redirect("/admin/settings");
  }

  return <WalletClient />;
}
