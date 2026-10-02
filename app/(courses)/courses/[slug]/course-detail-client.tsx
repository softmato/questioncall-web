"use client";
import { formatDuration } from "@/lib/duration";


import Link from "next/link";
import {
  BookOpenIcon,
  Clock3Icon,
  GraduationCapIcon,
  PlayCircleIcon,
  StarIcon,
  Users2Icon,
  VideoIcon,
} from "lucide-react";

import { PricingGate } from "@/components/course/PricingGate";
import { SectionAccordion } from "@/components/course/SectionAccordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CourseDetailData, UserRole } from "@/lib/course-page-data";

type Props = {
  course: CourseDetailData | null;
  isAuthenticated: boolean;
  userRole: UserRole;
};

export function CourseDetailClient({
  course,
  isAuthenticated,
  userRole,
}: Props) {
  if (!course) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-dashed border-border bg-background p-16">
          <BookOpenIcon className="mx-auto size-12 text-muted-foreground/40" />
          <h1 className="mt-4 text-2xl font-bold text-foreground">
            Course not found
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This course may have been removed or is not available yet.
          </p>
          <Button asChild className="mt-6">
            <Link href="/courses">Browse courses</Link>
          </Button>
        </div>
      </div>
    );
  }

  const continueHref = course.nextVideoId
    ? `/courses/${course.slug}/watch/${course.nextVideoId}`
    : `/courses/${course.slug}`;

  const upcomingLiveSessions = course.liveSessions.filter(
    (session) => session.status === "SCHEDULED" || session.status === "LIVE",
  );
  const previewVideoIds = course.sections
    .flatMap((section) => section.videos)
    .slice(0, course.freePreviewCount)
    .map((video) => video._id);

  return (
    <div className="bg-[#f6f8fb] dark:bg-background">
      <div className="border-b border-border bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 text-xs text-muted-foreground sm:px-6 lg:px-8">
          <Link
            href="/courses"
            className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
          >
            COURSES
          </Link>
          <span>/</span>
          <span className="line-clamp-1 font-medium uppercase text-foreground">
            {course.title}
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="flex flex-col gap-8 lg:flex-row">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{course.subject}</Badge>
              <Badge variant="outline">{course.level}</Badge>
              {course.canManage ? (
                <Badge variant="outline">{course.status}</Badge>
              ) : null}
              {course.isFeatured ? (
                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                  Featured
                </Badge>
              ) : null}
            </div>

            <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
              {course.title}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base whitespace-pre-wrap">
              {course.description}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <GraduationCapIcon className="size-4 text-emerald-600" />
                {course.instructorName}
              </span>
              {course.enrollmentCount > 0 ? (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Users2Icon className="size-4" />
                    {course.enrollmentCount} enrolled
                  </span>
                </>
              ) : null}
              <span>·</span>
              <span className="flex items-center gap-1">
                <VideoIcon className="size-4" />
                {course.lessonsCount} lessons
              </span>
            </div>

            {typeof course.overallProgressPercent === "number" ? (
              <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-50/60 p-4 dark:bg-emerald-950/20">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      Your progress
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Keep going from where you left off.
                    </div>
                  </div>
                  <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                    {Math.round(course.overallProgressPercent)}%
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950/60">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${course.overallProgressPercent}%` }}
                  />
                </div>
              </div>
            ) : null}

            {course.tags.length > 0 ? (
              <div className="mt-8">
                <h2 className="text-lg font-bold text-foreground">Highlights</h2>
                <ol className="mt-3 space-y-2">
                  {course.tags.map((tag, index) => (
                    <li key={tag} className="flex gap-3 text-sm text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {index + 1}.
                      </span>
                      {tag}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {upcomingLiveSessions.length > 0 ? (
              <div className="mt-8 rounded-2xl border border-border bg-background p-5">
                <h2 className="text-lg font-bold text-foreground">Live Sessions</h2>
                <div className="mt-4 space-y-3">
                  {upcomingLiveSessions.slice(0, 3).map((session) => (
                    <div
                      key={session._id}
                      className="rounded-xl border border-border bg-muted/20 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-foreground">
                            {session.title}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {new Date(session.scheduledAt).toLocaleString()}
                            {session.durationMinutes
                              ? ` · ${formatDuration(session.durationMinutes)}`
                              : ""}
                          </div>
                        </div>
                        <Badge variant="outline">{session.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-10">
              <h2 className="text-xl font-bold text-foreground">Course Content</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {course.sections.length} sections · {course.lessonsCount} lessons
              </p>

              <div className="mt-5">
                <SectionAccordion
                  sections={course.sections}
                  currentVideoId={null}
                  completedVideoIds={course.completedVideoIds}
                  courseSlug={course.slug}
                  allowLinks={course.hasAccess}
                  previewVideoIds={previewVideoIds}
                />
              </div>
            </div>
          </div>

          {/* First on phones so the price and buy button aren't below every section. */}
          <div className="order-first w-full shrink-0 lg:order-none lg:w-[360px]">
            <div className="sticky top-20">
              <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-lg">
                <div className="relative aspect-[16/10] w-full bg-gradient-to-br from-slate-800 to-emerald-900">
                  {course.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={course.thumbnailUrl}
                      alt={course.title}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <BookOpenIcon className="size-14 text-emerald-500/40" />
                    </div>
                  )}
                </div>

                <div className="space-y-5 p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock3Icon className="size-4" />
                    <span>{formatDuration(course.totalDurationMinutes)} of content</span>
                  </div>

                  {/* Show static price only when PricingGate is NOT rendered */}
                  {(course.canManage || course.hasAccess || !isAuthenticated) ? (
                    <div className="text-2xl font-bold text-foreground">
                      {course.pricingModel === "FREE"
                        ? "Free"
                        : course.pricingModel === "SUBSCRIPTION_INCLUDED"
                          ? "Included in subscription"
                          : `NPR ${(course.price ?? 0).toLocaleString()}`}
                    </div>
                  ) : null}

                  {course.canManage ? (
                    <div className="space-y-3">
                      <Button asChild className="w-full">
                        <Link href={`/courses/${course.slug}/manage`}>
                          Manage course
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="w-full">
                        <Link href={continueHref}>
                          <PlayCircleIcon className="mr-2 size-4" />
                          Preview content
                        </Link>
                      </Button>
                    </div>
                  ) : course.hasAccess ? (
                    <Button asChild className="h-12 w-full rounded-xl bg-emerald-600 font-semibold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700">
                      <Link href={continueHref}>
                        <PlayCircleIcon className="mr-2 size-4" />
                        Continue course
                      </Link>
                    </Button>
                  ) : !isAuthenticated ? (
                    <div className="space-y-3">
                      <Button asChild className="w-full">
                        <Link href="/auth/signin">Sign in to unlock access</Link>
                      </Button>
                      <Button asChild variant="outline" className="w-full">
                        <Link href="/auth/signup/student">Create account</Link>
                      </Button>
                    </div>
                  ) : (
                    <PricingGate
                      courseId={course._id}
                      courseSlug={course.slug}
                      pricingModel={course.pricingModel}
                      price={course.price}
                      hasActiveSubscription={course.hasActiveSubscription}
                      redirectToAfterAccess={continueHref}
                      initialCoupon={course.appliedCoupon}
                      manualPayment={course.manualPayment}
                    />
                  )}

                  {course.pendingPurchase ? (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
                      Your payment proof is pending admin verification. Access will
                      unlock as soon as it is approved.
                    </div>
                  ) : null}

                  <div className="space-y-3 pt-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      What&apos;s included
                    </h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <VideoIcon className="size-4 text-emerald-600" />
                        {course.lessonsCount} lessons
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock3Icon className="size-4 text-emerald-600" />
                        {formatDuration(course.totalDurationMinutes)}
                      </div>
                      {course.enrollmentCount > 0 ? (
                        <div className="flex items-center gap-2">
                          <Users2Icon className="size-4 text-emerald-600" />
                          {course.enrollmentCount} students enrolled
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2">
                        <StarIcon className="size-4 text-emerald-600" />
                        Structured sections and progress tracking
                      </div>
                    </div>
                  </div>


                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
