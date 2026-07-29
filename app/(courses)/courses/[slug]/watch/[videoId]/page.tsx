import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon, BookOpenIcon } from "lucide-react";

import { SectionAccordion } from "@/components/course/SectionAccordion";
import { VideoPlayer } from "@/components/course/VideoPlayer";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import { getSafeServerSession } from "@/lib/auth";
import { getCourseWatchPageData } from "@/lib/course-page-data";
import { serializeJsonLd } from "@/lib/json-ld";
import {
  absoluteUrl,
  createNoIndexMetadata,
  createPageMetadata,
} from "@/lib/seo";

/**
 * Free-preview lessons are public pages, so they get real indexable metadata.
 * Everything behind enrolment stays noindex.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; videoId: string }>;
}): Promise<Metadata> {
  const { slug, videoId } = await params;
  const preview = await getCourseWatchPageData({
    slug,
    videoId,
    userId: null,
    role: null,
  });

  if (!preview?.isPreview) {
    return createNoIndexMetadata({
      title: "Watch Lesson",
      description: "Private lesson playback and progress tracking.",
    });
  }

  return createPageMetadata({
    title: `${preview.currentVideo.title} — free preview`,
    description:
      preview.currentVideo.description ??
      `Watch "${preview.currentVideo.title}" from ${preview.course.title} free, no account needed.`,
    path: `/courses/${slug}/watch/${videoId}`,
    keywords: [
      preview.course.title,
      preview.currentVideo.title,
      "free lesson",
      "free preview",
    ],
  });
}

export default async function CourseWatchPage({
  params,
}: {
  params: Promise<{ slug: string; videoId: string }>;
}) {
  const session = await getSafeServerSession();
  const { slug, videoId } = await params;

  // No session is fine — the data layer only resolves free-preview videos for
  // anonymous viewers, so previews stay open to the public and to crawlers.
  const data = await getCourseWatchPageData({
    slug,
    videoId,
    userId: session?.user?.id ?? null,
    role: session?.user?.role ?? null,
  });

  if (!data) {
    // Signed out and it wasn't a preview: the lesson may well be theirs once
    // they log in, so send them to sign-in rather than a dead end.
    if (!session?.user?.id) {
      redirect(`/auth/signin?callbackUrl=/courses/${slug}/watch/${videoId}`);
    }
    redirect(`/courses/${slug}`);
  }

  const previewVideoIds = data.sections
    .flatMap((section) => section.videos)
    .slice(0, data.course.freePreviewCount)
    .map((video) => video._id);

  const isAnonymous = !session?.user?.id;

  const previewStructuredData = data.isPreview
    ? {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        name: data.currentVideo.title,
        description:
          data.currentVideo.description ??
          `Free preview lesson from ${data.course.title}.`,
        url: absoluteUrl(`/courses/${data.course.slug}/watch/${data.currentVideo._id}`),
        isPartOf: {
          "@type": "Course",
          name: data.course.title,
          url: absoluteUrl(`/courses/${data.course.slug}`),
        },
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
          id="course-preview-structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(previewStructuredData),
          }}
        />
      ) : null}
      <div className="border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Button asChild variant="ghost" size="icon">
            <Link href={`/courses/${data.course.slug}`}>
              <ArrowLeftIcon className="size-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="line-clamp-1 text-sm font-semibold text-foreground">
              {data.course.title}
            </div>
            <div className="line-clamp-1 text-xs text-muted-foreground">
              Watching lesson
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
        <div className="space-y-4">
          <VideoPlayer
            videoUrl={data.currentVideo.videoUrl}
            muxPlaybackId={data.currentVideo.muxPlaybackId}
            title={data.currentVideo.title}
            courseId={data.course._id}
            videoId={data.currentVideo._id}
            initialWatchedPercent={data.initialWatchedPercent}
            isPreview={data.isPreview}
          />

          {data.isPreview ? (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/70 p-5 dark:bg-emerald-950/20">
              <h2 className="text-lg font-semibold text-foreground">
                You&apos;re watching a free preview
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {isAnonymous
                  ? "No account needed for this lesson. Create a free account to save your progress and unlock the rest of the course."
                  : "Enroll or buy the course to unlock every lesson and save your progress."}
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
                  <Link href={`/courses/${data.course.slug}`}>Unlock full course</Link>
                </Button>
                {isAnonymous ? (
                  <Button asChild variant="outline">
                    <Link href="/auth/signup/student">Create free account</Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {data.currentVideo.description ? (
            <div className="rounded-2xl border border-border bg-background p-5">
              <h2 className="text-lg font-semibold text-foreground">
                About This Lesson
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {data.currentVideo.description}
              </p>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-background p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <BookOpenIcon className="size-4 text-emerald-600" />
              <h2 className="text-sm font-semibold text-foreground">
                Course Content
              </h2>
            </div>
            <SectionAccordion
              sections={data.sections}
              currentVideoId={data.currentVideo._id}
              completedVideoIds={data.completedVideoIds}
              courseSlug={data.course.slug}
              allowLinks={!data.isPreview}
              previewVideoIds={previewVideoIds}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
