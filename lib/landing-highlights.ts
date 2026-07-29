import "server-only";

import { getChapterBrowseData } from "@/lib/chapter-page-data";
import { getCourseBrowsePageData } from "@/lib/course-page-data";
import type { LandingLibraryItem } from "@/lib/landing-library";

function toPricing(model: string): LandingLibraryItem["pricing"] {
  if (model === "FREE") return "FREE";
  if (model === "SUBSCRIPTION_INCLUDED") return "SUBSCRIPTION";
  return "PAID";
}

/**
 * Public catalogue for the signed-out landing page. Resolved anonymously so it
 * only ever contains ACTIVE, publicly visible courses and chapters — the same
 * set /courses and /chapters show to a visitor.
 */
export async function getLandingLibraryItems(
  limit = 4,
): Promise<LandingLibraryItem[]> {
  const [courseData, chapterData] = await Promise.all([
    getCourseBrowsePageData({ userId: null, role: null }),
    getChapterBrowseData({ userId: null, role: null }),
  ]);

  const courses: LandingLibraryItem[] = courseData.courses.map((course) => ({
    id: course._id,
    kind: "COURSE",
    href: `/courses/${course.slug}`,
    title: course.title,
    subject: course.subject,
    level: course.level,
    uploader: course.instructorName,
    pricing: toPricing(course.pricingModel),
    price: typeof course.price === "number" ? `NPR ${course.price}` : null,
    thumbnailUrl: course.thumbnailUrl,
    lessons: course.lessonsCount,
    durationMinutes: course.totalDurationMinutes,
    liveSessions: course.liveSessionsEnabled,
    isFeatured: course.isFeatured,
  }));

  const chapters: LandingLibraryItem[] = chapterData.chapters
    .filter((chapter) => chapter.status === "ACTIVE")
    .map((chapter) => ({
      id: chapter._id,
      kind: "CHAPTER",
      href: `/chapters/${chapter.slug}`,
      title: chapter.title,
      subject: chapter.subject,
      level: chapter.level,
      uploader: chapter.instructorName,
      pricing: toPricing(chapter.pricingModel),
      price: typeof chapter.price === "number" ? `NPR ${chapter.price}` : null,
      thumbnailUrl: chapter.thumbnailUrl,
      lessons: chapter.contentsCount,
      durationMinutes: chapter.totalDurationMinutes,
      liveSessions: false,
      isFeatured: false,
    }));

  // Featured first, then keep a course/chapter mix rather than letting whichever
  // collection is larger fill every slot.
  const featured = [...courses, ...chapters].filter((item) => item.isFeatured);
  const rest: LandingLibraryItem[] = [];
  const remainingCourses = courses.filter((item) => !item.isFeatured);
  const remainingChapters = chapters.filter((item) => !item.isFeatured);

  for (let i = 0; i < Math.max(remainingCourses.length, remainingChapters.length); i += 1) {
    if (remainingCourses[i]) rest.push(remainingCourses[i]);
    if (remainingChapters[i]) rest.push(remainingChapters[i]);
  }

  return [...featured, ...rest].slice(0, limit);
}
