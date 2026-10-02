import type { Session } from "next-auth";
import { cookies } from "next/headers";

import {
  CouponGiftModal,
  GlobalNoticeModal,
  WorkspaceHome,
  WorkspaceShell,
} from "@/components/shared/lazy-home";
import { getWorkspaceUser } from "@/lib/auth";
import { getCourseBrowsePageData } from "@/lib/course-page-data";
import { getPlatformConfig, getPlatformSocialLinks } from "@/models/PlatformConfig";

/** The signed-in home (app/page.tsx): the feed inside the workspace shell. */
export default async function SignedInHome({ sessionUser }: { sessionUser: Session["user"] }) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const workspaceUser = await getWorkspaceUser(sessionUser);
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
      {sessionUser.role === "STUDENT" && (
        <CouponGiftModal firstName={sessionUser.name?.split(" ")[0] ?? null} />
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
