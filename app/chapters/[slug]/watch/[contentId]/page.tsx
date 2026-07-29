import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon, BookOpenIcon } from "lucide-react";

import { getSafeServerSession } from "@/lib/auth";
import { getChapterWatchData } from "@/lib/chapter-page-data";
import { APP_NAME } from "@/lib/constants";
import { serializeJsonLd } from "@/lib/json-ld";
import {
  absoluteUrl,
  createNoIndexMetadata,
  createPageMetadata,
} from "@/lib/seo";
import { ChapterContentList } from "@/components/chapter/ChapterContentList";
import { ChapterContentPlayer } from "@/components/chapter/ChapterContentPlayer";
import { Button } from "@/components/ui/button";

/**
 * Free-preview chapter items are public pages, so they get indexable metadata.
 * Everything behind enrolment stays noindex.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; contentId: string }>;
}): Promise<Metadata> {
  const { slug, contentId } = await params;
  const preview = await getChapterWatchData({
    slug,
    contentId,
    userId: null,
    role: null,
  });

  // Resolving anonymously at all means the item is public — either a free
  // preview, or an item in a FREE chapter. Anything else stays out of the index.
  if (!preview) {
    return createNoIndexMetadata({
      title: "Chapter Content",
      description: "Private chapter playback.",
    });
  }

  return createPageMetadata({
    title: `${preview.currentContent.title} — free preview`,
    description:
      preview.currentContent.description ??
      `Open "${preview.currentContent.title}" from the ${preview.chapter.title} chapter free, no account needed.`,
    path: `/chapters/${slug}/watch/${contentId}`,
    keywords: [preview.chapter.title, preview.currentContent.title, "free preview"],
  });
}

export default async function ChapterWatchPage({
  params,
}: {
  params: Promise<{ slug: string; contentId: string }>;
}) {
  const session = await getSafeServerSession();
  const { slug, contentId } = await params;

  // No session is fine — the data layer only resolves free-preview items for
  // anonymous viewers, so previews stay open to the public and to crawlers.
  const data = await getChapterWatchData({
    slug,
    contentId,
    userId: session?.user?.id ?? null,
    role: session?.user?.role ?? null,
  });

  if (!data) {
    if (!session?.user?.id) {
      redirect(`/auth/signin?callbackUrl=/chapters/${slug}/watch/${contentId}`);
    }
    redirect(`/chapters/${slug}`);
  }

  const isAnonymous = !session?.user?.id;

  const previewStructuredData =
    isAnonymous && data.currentContent.type === "VIDEO"
      ? {
          "@context": "https://schema.org",
          "@type": "VideoObject",
          name: data.currentContent.title,
          description:
            data.currentContent.description ??
            `Free preview from the ${data.chapter.title} chapter.`,
          url: absoluteUrl(
            `/chapters/${data.chapter.slug}/watch/${data.currentContent._id}`,
          ),
          publisher: {
            "@type": "EducationalOrganization",
            name: APP_NAME,
            url: absoluteUrl("/"),
          },
          isAccessibleForFree: true,
        }
      : null;

  return (
    <div className="min-h-svh bg-[#f6f8fb] dark:bg-background">
      {previewStructuredData ? (
        <script
          id="chapter-preview-structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(previewStructuredData),
          }}
        />
      ) : null}
      <div className="border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Button asChild variant="ghost" size="icon">
            <Link href={`/chapters/${data.chapter.slug}`}>
              <ArrowLeftIcon className="size-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="line-clamp-1 text-sm font-semibold text-foreground">
              {data.chapter.title}
            </div>
            <div className="text-xs text-muted-foreground">Chapter content</div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
        <div className="space-y-4">
          <ChapterContentPlayer
            title={data.currentContent.title}
            type={data.currentContent.type}
            videoUrl={data.currentContent.videoUrl}
            muxPlaybackId={data.currentContent.muxPlaybackId}
            fileUrl={data.currentContent.fileUrl}
            fileName={data.currentContent.fileName}
          />

          {data.isPreview ? (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/70 p-5 dark:bg-emerald-950/20">
              <h2 className="text-lg font-semibold text-foreground">
                You&apos;re viewing a free preview
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {isAnonymous
                  ? "No account needed for this item. Create a free account to unlock the rest of the chapter."
                  : "Unlock the chapter to access every item."}
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
                  <Link href={`/chapters/${data.chapter.slug}`}>Unlock chapter</Link>
                </Button>
                {isAnonymous ? (
                  <Button asChild variant="outline">
                    <Link href="/auth/signup/student">Create free account</Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {data.currentContent.description ? (
            <div className="rounded-2xl border border-border bg-background p-5">
              <h2 className="text-lg font-semibold text-foreground">About</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {data.currentContent.description}
              </p>
            </div>
          ) : null}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-background p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <BookOpenIcon className="size-4 text-emerald-600" />
              <h2 className="text-sm font-semibold">Chapter Content</h2>
            </div>
            <ChapterContentList
              slug={data.chapter.slug}
              contents={data.contents}
              hasAccess={!data.isPreview}
              previewCount={data.chapter.freePreviewCount}
              currentContentId={data.currentContent._id}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
