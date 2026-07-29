import Link from "next/link";
import { BookOpenIcon, Clock3Icon, PlayCircleIcon } from "lucide-react";

import { getSafeServerSession } from "@/lib/auth";
import { getChapterBrowseData } from "@/lib/chapter-page-data";
import type { ChapterCardData } from "@/lib/chapter-page-data";
import { APP_NAME } from "@/lib/constants";
import { serializeJsonLd } from "@/lib/json-ld";
import { absoluteUrl, createPageMetadata } from "@/lib/seo";
import { Badge } from "@/components/ui/badge";

export const metadata = createPageMetadata({
  title: "Chapters",
  description:
    "Browse standalone study chapters — short video and document bundles you can buy one at a time. Many open with free preview lessons.",
  path: "/chapters",
  keywords: [
    "study chapters Nepal",
    "Question Call chapters",
    "single chapter course",
    "free preview lessons",
  ],
});

function priceLabel(chapter: ChapterCardData) {
  if (chapter.pricingModel === "FREE") return "Free";
  if (chapter.pricingModel === "SUBSCRIPTION_INCLUDED") {
    return "Included in subscription";
  }
  return typeof chapter.price === "number" ? `Rs. ${chapter.price}` : "Paid";
}

function ChapterCard({ chapter }: { chapter: ChapterCardData }) {
  return (
    <Link
      href={`/chapters/${chapter.slug}`}
      className="flex flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm transition-shadow hover:shadow-md"
    >
      {chapter.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={chapter.thumbnailUrl}
          alt={chapter.title}
          className="aspect-video w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center bg-muted/30">
          <BookOpenIcon className="size-8 text-muted-foreground" />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {chapter.subject ? (
            <Badge variant="secondary">{chapter.subject}</Badge>
          ) : null}
          {chapter.freePreviewCount > 0 ? (
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              {chapter.freePreviewCount} free preview
              {chapter.freePreviewCount > 1 ? "s" : ""}
            </Badge>
          ) : null}
        </div>

        <h2 className="text-base font-semibold text-foreground">{chapter.title}</h2>
        <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
          {chapter.description}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-4 pt-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <PlayCircleIcon className="size-3.5" />
            {chapter.contentsCount} item{chapter.contentsCount === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3Icon className="size-3.5" />
            {chapter.totalDurationMinutes} min
          </span>
          <span className="ml-auto font-semibold text-foreground">
            {priceLabel(chapter)}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default async function ChaptersBrowsePage() {
  const session = await getSafeServerSession();
  const data = await getChapterBrowseData({
    userId: session?.user?.id ?? null,
    role: session?.user?.role ?? null,
  });

  // Server-rendered so the full chapter list is in the initial HTML for crawlers.
  const chapters = data.chapters.filter((chapter) => chapter.status === "ACTIVE");

  const listStructuredData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${APP_NAME} chapters`,
    itemListElement: chapters.slice(0, 50).map((chapter, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: chapter.title,
      url: absoluteUrl(`/chapters/${chapter.slug}`),
    })),
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <script
        id="chapters-list-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(listStructuredData) }}
      />

      <header className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
          Chapters
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground">
          Study one chapter at a time
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Chapters are short, self-contained bundles of videos and documents. Buy
          only the chapter you need, and start with the free preview lessons — no
          account required to watch those.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/courses"
            className="inline-flex items-center justify-center rounded-full border border-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
          >
            Browse full courses
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-full border border-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
          >
            See subscription plans
          </Link>
        </div>
      </header>

      {chapters.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No chapters published yet. Check back soon.
        </div>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {chapters.map((chapter) => (
            <ChapterCard key={chapter._id} chapter={chapter} />
          ))}
        </div>
      )}
    </div>
  );
}
