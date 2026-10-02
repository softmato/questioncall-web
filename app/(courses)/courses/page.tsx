import { getSafeServerSession } from "@/lib/auth";
import { getChapterBrowseData } from "@/lib/chapter-page-data";
import { getCourseBrowsePageData } from "@/lib/course-page-data";
import { createPageMetadata } from "@/lib/seo";
import { CoursesBrowseClient } from "./courses-browse";

export const metadata = createPageMetadata({
  title: "Courses",
  description:
    "Browse free, subscription-included, and paid courses. Learn from structured lessons, recordings, and live classes.",
  path: "/courses",
  keywords: [
    "online courses Nepal",
    "QuestionCall courses",
    "live classes Nepal",
    "guided courses",
  ],
});

export default async function CoursesPage() {
  const session = await getSafeServerSession();
  const data = await getCourseBrowsePageData({
    userId: session?.user?.id ?? null,
    role: session?.user?.role ?? null,
  });
  const chapterData = await getChapterBrowseData({
    userId: session?.user?.id ?? null,
    role: session?.user?.role ?? null,
  });

  return (
    <CoursesBrowseClient
      courses={data.courses}
      featuredCourses={data.featuredCourses}
      enrolledCourses={data.enrolledCourses}
      managedCourses={data.managedCourses}
      chapters={chapterData.chapters}
      featuredChapters={chapterData.featuredChapters}
      enrolledChapters={chapterData.enrolledChapters}
      managedChapters={chapterData.managedChapters}
      subjects={data.subjects}
      levels={data.levels}
      stats={data.stats}
      isAuthenticated={Boolean(session?.user?.id)}
      userRole={session?.user?.role ?? null}
    />
  );
}
