import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/shared/sign-out-button";
import { getSafeServerSession, getProfilePath } from "@/lib/auth";
import { AdminHeaderClient } from "@/components/admin/admin-header-client";
import { AdminSearchClient } from "@/components/admin/admin-search-client";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminLayoutClient } from "@/components/admin/admin-layout-client";
import { OnboardingVideoModal } from "@/components/shared/onboarding-video-modal";
import { getAdminNotificationCounts } from "@/lib/admin-notifications";
import { createNoIndexMetadata } from "@/lib/seo";

export const metadata = createNoIndexMetadata({
  title: "Admin",
  description: "Private administrative routes for QuestionCall staff.",
});

async function getAdminCounts(adminUserId: string) {
  return getAdminNotificationCounts(adminUserId);
}

export default async function AdminPortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSafeServerSession();

  if (!session?.user?.role) {
    redirect("/");
  }

  if (session.user.role !== "ADMIN") {
    redirect(getProfilePath(session.user));
  }

  const counts = await getAdminCounts(session.user.id);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <OnboardingVideoModal />
      <AdminLayoutClient />
      
      {/* Desktop Sidebar - hidden on mobile, visible on lg+ */}
      <div className="hidden lg:block h-full">
        <AdminSidebar />
      </div>
      
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b gap-4 border-border bg-background px-4 md:px-8">
          <div className="flex flex-1 max-w-xl items-center pl-10 lg:pl-0">
            <div className="w-full">
              <AdminSearchClient />
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
            <AdminHeaderClient initialCounts={counts} />
            <div className="hidden md:block h-6 w-px bg-border" />
            <div className="hidden md:block">
              <SignOutButton />
            </div>
            {/* Mobile sign out - visible only on mobile */}
            <div className="md:hidden">
              <SignOutButton />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-muted/30 p-4 md:p-8">
          <div className="mx-auto max-w-[1600px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}