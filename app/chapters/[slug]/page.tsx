import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getSafeServerSession } from "@/lib/auth";
import { getChapterDetailData } from "@/lib/chapter-page-data";
import { APP_NAME } from "@/lib/constants";
import { serializeJsonLd } from "@/lib/json-ld";
import { absoluteUrl, createPageMetadata, truncateDescription } from "@/lib/seo";
import { ChapterDetailClient } from "./chapter-detail-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  // Resolved anonymously so the metadata describes what the public can see.
  const chapter = await getChapterDetailData({ slug, userId: null, role: null });

  return createPageMetadata({
    title: chapter?.title ?? slug.replace(/-/g, " "),
    description:
      chapter?.description ??
      "Standalone chapter with videos and documents you can study at your own pace.",
    path: `/chapters/${slug}`,
    image: chapter?.thumbnailUrl ?? null,
    keywords: [
      "Question Call chapters",
      "study chapters Nepal",
      chapter?.subject ?? "",
      chapter?.title ?? "",
    ].filter(Boolean),
  });
}

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getSafeServerSession();
  const { slug } = await params;
  const chapter = await getChapterDetailData({
    slug,
    userId: session?.user?.id ?? null,
    role: session?.user?.role ?? null,
  });

  if (!chapter) {
    notFound();
  }

  const chapterStructuredData = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: chapter.title,
    description: truncateDescription(chapter.description ?? "", 300),
    url: absoluteUrl(`/chapters/${chapter.slug}`),
    image: [chapter.thumbnailUrl ?? absoluteUrl("/logo.png")],
    provider: {
      "@type": "EducationalOrganization",
      name: APP_NAME,
      url: absoluteUrl("/"),
    },
    instructor: {
      "@type": "Person",
      name: chapter.instructorName,
    },
    about: chapter.subject,
    educationalLevel: chapter.level,
    isAccessibleForFree: chapter.pricingModel === "FREE",
    offers:
      chapter.pricingModel === "PAID" && typeof chapter.price === "number"
        ? {
            "@type": "Offer",
            priceCurrency: "NPR",
            price: chapter.price,
            availability: "https://schema.org/InStock",
            url: absoluteUrl(`/chapters/${chapter.slug}`),
          }
        : undefined,
  };

  return (
    <>
      <script
        id="chapter-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(chapterStructuredData),
        }}
      />
      <ChapterDetailClient
        chapter={chapter}
        isAuthenticated={Boolean(session?.user?.id)}
        userRole={session?.user?.role ?? null}
      />
    </>
  );
}
