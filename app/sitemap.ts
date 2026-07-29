import type { MetadataRoute } from "next";
import { connectToDatabase } from "@/lib/mongodb";
import Chapter from "@/models/Chapter";
import ChapterContent from "@/models/ChapterContent";
import Course from "@/models/Course";
import CourseSection from "@/models/CourseSection";
import CourseVideo from "@/models/CourseVideo";
import { SITE_URL } from "@/lib/site-url";

type SitemapCourse = {
  _id: unknown;
  slug: string;
  freePreviewCount?: number;
  updatedAt?: Date;
};

type SitemapChapter = SitemapCourse & { pricingModel?: string };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/courses`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/chapters`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: `${SITE_URL}/quiz`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/auth/signup/student`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/auth/signup/teacher`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.75,
    },
    {
      url: `${SITE_URL}/legal`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];

  const dynamicRoutes: MetadataRoute.Sitemap = [];

  try {
    await connectToDatabase();

    const [activeCourses, activeChapters] = await Promise.all([
      Course.find(
        { status: "ACTIVE", mergedInto: null },
        "slug freePreviewCount updatedAt",
      ).lean<SitemapCourse[]>(),
      Chapter.find(
        { status: "ACTIVE" },
        "slug freePreviewCount pricingModel updatedAt",
      ).lean<SitemapChapter[]>(),
    ]);

    const hasSlug = (entry: { slug?: string }) =>
      typeof entry.slug === "string" && entry.slug.trim().length > 0;

    const courses = activeCourses.filter(hasSlug);
    const chapters = activeChapters.filter(hasSlug);

    for (const course of courses) {
      dynamicRoutes.push({
        url: `${SITE_URL}/courses/${course.slug}`,
        lastModified: course.updatedAt || new Date(),
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    for (const chapter of chapters) {
      dynamicRoutes.push({
        url: `${SITE_URL}/chapters/${chapter.slug}`,
        lastModified: chapter.updatedAt || new Date(),
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    // Free-preview lessons are public pages, so they belong in the sitemap.
    // Preview order must match lib/course-access.ts: section order, then video
    // order within the section.
    const previewCourses = courses.filter(
      (course) => (course.freePreviewCount ?? 0) > 0,
    );

    if (previewCourses.length > 0) {
      const courseIds = previewCourses.map((course) => course._id);
      const [sections, videos] = await Promise.all([
        CourseSection.find({ courseId: { $in: courseIds } })
          .select("_id courseId order")
          .lean(),
        CourseVideo.find({ courseId: { $in: courseIds } })
          .select("_id courseId sectionId order")
          .lean(),
      ]);

      const sectionOrderById = new Map(
        sections.map((section) => [
          String(section._id),
          section.order ?? Number.MAX_SAFE_INTEGER,
        ]),
      );

      for (const course of previewCourses) {
        const courseVideos = videos
          .filter((video) => String(video.courseId) === String(course._id))
          .sort((a, b) => {
            const sa = sectionOrderById.get(String(a.sectionId)) ?? Number.MAX_SAFE_INTEGER;
            const sb = sectionOrderById.get(String(b.sectionId)) ?? Number.MAX_SAFE_INTEGER;
            return sa !== sb ? sa - sb : (a.order ?? 0) - (b.order ?? 0);
          })
          .slice(0, course.freePreviewCount ?? 0);

        for (const video of courseVideos) {
          dynamicRoutes.push({
            url: `${SITE_URL}/courses/${course.slug}/watch/${String(video._id)}`,
            lastModified: course.updatedAt || new Date(),
            changeFrequency: "monthly",
            priority: 0.6,
          });
        }
      }
    }

    // Chapter items are public when previewed, or when the whole chapter is FREE.
    const previewChapters = chapters.filter(
      (chapter) =>
        (chapter.freePreviewCount ?? 0) > 0 || chapter.pricingModel === "FREE",
    );

    if (previewChapters.length > 0) {
      const contents = await ChapterContent.find({
        chapterId: { $in: previewChapters.map((chapter) => chapter._id) },
      })
        .select("_id chapterId order")
        .lean();

      for (const chapter of previewChapters) {
        const limit =
          chapter.pricingModel === "FREE"
            ? Number.MAX_SAFE_INTEGER
            : chapter.freePreviewCount ?? 0;

        const chapterContents = contents
          .filter((content) => String(content.chapterId) === String(chapter._id))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .slice(0, limit);

        for (const content of chapterContents) {
          dynamicRoutes.push({
            url: `${SITE_URL}/chapters/${chapter.slug}/watch/${String(content._id)}`,
            lastModified: chapter.updatedAt || new Date(),
            changeFrequency: "monthly",
            priority: 0.6,
          });
        }
      }
    }
  } catch (error) {
    console.error("Failed to build dynamic sitemap entries:", error);
  }

  return [...staticRoutes, ...dynamicRoutes];
}
