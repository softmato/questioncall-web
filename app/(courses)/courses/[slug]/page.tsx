import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getSafeServerSession } from "@/lib/auth";
import { getCourseDetailPageData } from "@/lib/course-page-data";
import { getMergedRedirectSlug } from "@/lib/course-merge";
import { connectToDatabase } from "@/lib/mongodb";
import { APP_NAME } from "@/lib/constants";
import { serializeJsonLd } from "@/lib/json-ld";
import { absoluteUrl, createPageMetadata, truncateDescription } from "@/lib/seo";
import Course from "@/models/Course";
import { CourseDetailClient } from "./course-detail-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  await connectToDatabase();

  const course = await Course.findOne({ slug })
    .select("title description thumbnailUrl")
    .lean<{ title?: string; description?: string; thumbnailUrl?: string | null } | null>();

  return createPageMetadata({
    title: course?.title ?? slug.replace(/-/g, " "),
    description: course?.description ?? "View course details, syllabus, and enroll.",
    path: `/courses/${slug}`,
    image: course?.thumbnailUrl ?? null,
    keywords: [
      "Question Call courses",
      "online courses Nepal",
      course?.title ?? "",
    ].filter(Boolean),
  });
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getSafeServerSession();
  const course = await getCourseDetailPageData({
    slug,
    userId: session?.user?.id ?? null,
    role: session?.user?.role ?? null,
  });

  if (!course) {
    // Old links to a course that was merged into another one keep working.
    const mergedSlug = await getMergedRedirectSlug(slug);
    if (mergedSlug) {
      redirect(`/courses/${mergedSlug}`);
    }
    notFound();
  }

  const courseStructuredData = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: truncateDescription(course.description, 300),
    url: absoluteUrl(`/courses/${course.slug}`),
    image: [course.thumbnailUrl ?? absoluteUrl("/logo.png")],
    provider: {
      "@type": "EducationalOrganization",
      name: APP_NAME,
      url: absoluteUrl("/"),
    },
    instructor: {
      "@type": "Person",
      name: course.instructorName,
    },
    about: course.subject,
    educationalLevel: course.level,
    offers:
      course.pricingModel === "PAID" && typeof course.price === "number"
        ? {
            "@type": "Offer",
            priceCurrency: "NPR",
            price: course.price,
            availability: "https://schema.org/InStock",
            url: absoluteUrl(`/courses/${course.slug}`),
          }
        : undefined,
  };

  return (
    <>
      <script
        id="course-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(courseStructuredData),
        }}
      />
      <CourseDetailClient
        course={course}
        isAuthenticated={Boolean(session?.user?.id)}
        userRole={session?.user?.role ?? null}
      />
    </>
  );
}
