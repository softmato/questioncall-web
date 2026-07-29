import type { Metadata } from "next";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { PublicLanding } from "@/components/shared/public-landing";
import { WorkspaceHome } from "@/components/shared/workspace-home";
import { WorkspaceShell } from "@/components/shared/workspace-shell";
import { GlobalNoticeModal } from "@/components/shared/global-notice-modal";
import { CouponGiftModal } from "@/components/subscription/coupon-gift-modal";
import { getDefaultPath, getSafeServerSession, getWorkspaceUser } from "@/lib/auth";
import { getCourseBrowsePageData } from "@/lib/course-page-data";
import { getLandingLibraryItems } from "@/lib/landing-highlights";
import {
  getCustomerServiceDetails,
  getLandingUserCountOffset,
  getPlatformConfig,
  getPlatformSocialLinks,
} from "@/models/PlatformConfig";
import User from "@/models/User";
import { APP_NAME } from "@/lib/constants";
import { createPageMetadata } from "@/lib/seo";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const publicHomeMetadata = createPageMetadata({
  title: "Learn Smarter With Expert Teachers",
  description:
    "Question Call helps students learn through expert answers, guided courses, live sessions, and interactive quizzes in one platform.",
  path: "/",
  keywords: [
    "Question Call",
    "Question Call Nepal",
    "online learning Nepal",
    "student help Nepal",
    "ask expert teachers online",
  ],
});

export async function generateMetadata(): Promise<Metadata> {
  const session = await getSafeServerSession();

  if (session?.user) {
    return {
      ...createPageMetadata({
        title: "Home",
        description: "Your Question Call home.",
        path: "/",
        index: false,
        follow: false,
      }),
      title: {
        absolute: APP_NAME,
      },
    };
  }

  return publicHomeMetadata;
}

export default async function HomePage() {
  const session = await getSafeServerSession();

  if (!session?.user) {
    const config = await getPlatformConfig();
    const socialLinks = getPlatformSocialLinks(config);
    const [realUserCount, libraryItems] = await Promise.all([
      User.countDocuments({ role: { $in: ["STUDENT", "TEACHER"] } }),
      // Real published courses/chapters for the library section, so the landing
      // page links into the actual catalogue instead of showing sample cards.
      getLandingLibraryItems(4),
    ]);
    const landingDisplayUserCount =
      realUserCount + getLandingUserCountOffset(config);

    return (
      <PublicLanding
        trialDays={config.trialDays}
        customerService={getCustomerServiceDetails(config)}
        socialLinks={socialLinks}
        landingDisplayUserCount={landingDisplayUserCount}
        libraryItems={libraryItems}
      />
    );
  }

  if (session.user.role === "ADMIN") {
    redirect(getDefaultPath(session.user.role));
  }

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const workspaceUser = await getWorkspaceUser(session.user);
  const config = await getPlatformConfig();
  const socialLinks = getPlatformSocialLinks(config);
  const dailyTargets: { target: number; bonus: number }[] = JSON.parse(
    JSON.stringify(config.dailyTargets ?? []),
  );
  const coursePageData = await getCourseBrowsePageData({
    userId: workspaceUser.id,
    role: workspaceUser.role as "STUDENT" | "TEACHER" | "ADMIN",
  });
  const courseHighlights = (
    coursePageData.featuredCourses.length > 0
      ? coursePageData.featuredCourses
      : coursePageData.courses
  )
    .slice(0, 6)
    .map((course) => ({
      id: course._id,
      slug: course.slug,
      title: course.title,
      subject: course.subject,
      level: course.level,
      description: course.description,
      thumbnailUrl: course.thumbnailUrl,
      pricingModel: course.pricingModel,
      price: course.price,
      instructorName: course.instructorName,
      lessonsCount: course.lessonsCount,
      enrollmentCount: course.enrollmentCount,
    }));

  return (
    <>
      <GlobalNoticeModal />
      {/* Students land here after login, so the gift has to be mounted on this
          route too — it is NOT covered by the (workspace) layout. */}
      {session.user.role === "STUDENT" && (
        <CouponGiftModal firstName={session.user.name?.split(" ")[0] ?? null} />
      )}
      <WorkspaceShell user={workspaceUser} socialLinks={socialLinks} dailyTargets={dailyTargets} defaultOpen={defaultOpen}>
        <WorkspaceHome
          role={workspaceUser.role as "STUDENT" | "TEACHER"}
          userId={workspaceUser.id}
          courseHighlights={courseHighlights}
        />
      </WorkspaceShell>
    </>
  );
}
