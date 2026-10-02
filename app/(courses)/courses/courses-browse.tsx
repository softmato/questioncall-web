"use client";
import { formatDuration } from "@/lib/duration";


import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenIcon,
  Clock3Icon,
  GraduationCapIcon,
  PlayCircleIcon,
  PlusIcon,
  SearchIcon,
  Users2Icon,
  VideoIcon,
} from "lucide-react";

import type { CourseCardData, UserRole } from "@/lib/course-page-data";
import type { ChapterCardData } from "@/lib/chapter-page-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COURSE_UPDATED_EVENT, COURSE_UPDATES_CHANNEL } from "@/lib/pusher/events";
import { APP_NAME } from "@/lib/constants";
import { useTheme } from "next-themes";

type CoursesBrowseClientProps = {
  courses: CourseCardData[];
  featuredCourses: CourseCardData[];
  enrolledCourses: CourseCardData[];
  managedCourses: CourseCardData[];
  chapters: ChapterCardData[];
  featuredChapters: ChapterCardData[];
  enrolledChapters: ChapterCardData[];
  managedChapters: ChapterCardData[];
  subjects: string[];
  levels: string[];
  stats: {
    totalCourses: number;
    totalEnrollments: number;
    totalInstructors: number;
  };
  isAuthenticated: boolean;
  userRole: UserRole;
};

const PRICING_OPTIONS = [
  { label: "All pricing", value: "" },
  { label: "Free", value: "FREE" },
  { label: "Subscription", value: "SUBSCRIPTION_INCLUDED" },
  { label: "Paid", value: "PAID" },
];

function getPricingLabel(
  pricingModel: CourseCardData["pricingModel"],
  price: number | null,
) {
  if (pricingModel === "FREE") {
    return "Free";
  }

  if (pricingModel === "SUBSCRIPTION_INCLUDED") {
    return "Subscription";
  }

  return `NPR ${(price ?? 0).toLocaleString()}`;
}

function getPricingColor(pricingModel: CourseCardData["pricingModel"]) {
  if (pricingModel === "FREE") {
    return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400";
  }

  if (pricingModel === "SUBSCRIPTION_INCLUDED") {
    return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-400";
  }

  return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-400";
}

export function CoursesBrowseClient({
  courses,
  featuredCourses,
  enrolledCourses,
  managedCourses,
  chapters,
  featuredChapters,
  enrolledChapters,
  managedChapters,
  subjects,
  levels,
  stats,
  isAuthenticated,
  userRole,
}: CoursesBrowseClientProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const [search, setSearch] = useState("");
  const [pricingFilter, setPricingFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");

  const isDark = theme === "dark";
  const isStudent = userRole === "STUDENT";
  const canManageCourses = userRole === "TEACHER" || userRole === "ADMIN";

  const filteredCourses = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return courses.filter((course) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        course.title.toLowerCase().includes(normalizedSearch) ||
        course.description.toLowerCase().includes(normalizedSearch) ||
        course.subject.toLowerCase().includes(normalizedSearch) ||
        course.instructorName.toLowerCase().includes(normalizedSearch);

      const matchesPricing =
        pricingFilter.length === 0 || course.pricingModel === pricingFilter;
      const matchesSubject =
        subjectFilter.length === 0 || course.subject === subjectFilter;
      const matchesLevel = levelFilter.length === 0 || course.level === levelFilter;

      return matchesSearch && matchesPricing && matchesSubject && matchesLevel;
    });
  }, [courses, levelFilter, pricingFilter, search, subjectFilter]);

  const filteredChapters = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return chapters.filter((chapter) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        chapter.title.toLowerCase().includes(normalizedSearch) ||
        chapter.description.toLowerCase().includes(normalizedSearch) ||
        chapter.subject.toLowerCase().includes(normalizedSearch) ||
        chapter.instructorName.toLowerCase().includes(normalizedSearch);

      const matchesPricing =
        pricingFilter.length === 0 || chapter.pricingModel === pricingFilter;
      const matchesSubject =
        subjectFilter.length === 0 || chapter.subject === subjectFilter;
      const matchesLevel = levelFilter.length === 0 || chapter.level === levelFilter;

      return matchesSearch && matchesPricing && matchesSubject && matchesLevel;
    });
  }, [chapters, levelFilter, pricingFilter, search, subjectFilter]);

  useEffect(() => {
    // Live refresh is for signed-in learners. A visitor or crawler would hold a
    // Pusher connection (a paid, capped resource), and download its client,
    // just to browse.
    if (!isAuthenticated) return;

    let cancelled = false;
    let stop: (() => void) | undefined;

    void import("@/lib/pusher/pusherClient").then(({ getPusherClient }) => {
      const client = getPusherClient();
      if (cancelled || !client) return;

      const channel = client.subscribe(COURSE_UPDATES_CHANNEL);
      const handleCourseUpdated = () => {
        router.refresh();
      };

      channel.bind(COURSE_UPDATED_EVENT, handleCourseUpdated);
      stop = () => {
        channel.unbind(COURSE_UPDATED_EVENT, handleCourseUpdated);
        client.unsubscribe(COURSE_UPDATES_CHANNEL);
      };
    });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [isAuthenticated, router]);

  return (
    <div className="min-h-svh bg-[#f6f8fb] dark:bg-background">
      {!isAuthenticated && (
        <section className="relative overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:bg-none">
        <div className="pointer-events-none absolute inset-0">
          <div className={`absolute -top-24 right-0 h-[500px] w-[500px] rounded-full blur-[100px] ${isDark ? "bg-emerald-500/15" : "bg-emerald-300/15"}`} />
          <div className={`absolute bottom-0 left-0 h-[400px] w-[400px] rounded-full blur-[80px] ${isDark ? "bg-teal-500/10" : "bg-teal-300/10"}`} />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="flex flex-col lg:flex-row gap-12 items-center">
            <div className="max-w-2xl flex-1">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <GraduationCapIcon className={`size-4 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
                <span className={`text-xs font-semibold tracking-wide ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                  ONLINE COURSES
                </span>
              </div>
              <h1 className={`text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl ${isDark ? "text-white" : "text-slate-900"}`}>
                Sharpen Your Skills With{" "}
                <span className={`bg-gradient-to-r bg-clip-text text-transparent ${isDark ? "from-emerald-400 to-teal-300" : "from-emerald-600 to-teal-500"}`}>
                  {APP_NAME} Courses
                </span>
              </h1>
              <p className={`mt-5 max-w-xl text-base leading-relaxed sm:text-lg ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Learn from structured lessons, live classes, and recordings across
                free, subscription-included, and paid courses.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button
                  size="lg"
                  className={`bg-emerald-600 px-8 text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-700 ${isDark ? "" : "bg-emerald-500 hover:bg-emerald-600"}`}
                  asChild
                >
                  <a href="#browse">
                    <PlayCircleIcon className="mr-2 size-5" />
                    Browse Courses
                  </a>
                </Button>
                {isAuthenticated ? (
                  isStudent ? (
                    <Button
                      asChild
                      size="lg"
                      variant="outline"
                      className={isDark ? "border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900"}
                    >
                      <Link href="/courses/my">My Courses</Link>
                    </Button>
                  ) : canManageCourses ? (
                    <Button
                      asChild
                      size="lg"
                      variant="outline"
                      className={isDark ? "border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900"}
                    >
                      <Link href="/studio">Course Studio</Link>
                    </Button>
                  ) : null
                ) : (
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className={isDark ? "border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900"}
                  >
                    <Link href="/auth/signup/student">Create Free Account</Link>
                  </Button>
                )}
              </div>

              <div className={`mt-14 grid grid-cols-3 gap-6 border-t pt-8 sm:max-w-lg ${isDark ? "border-slate-700/50" : "border-slate-200"}`}>
                {[
                  { value: `${stats.totalCourses + chapters.length}+`, label: "Courses" },
                  {
                    value: `${stats.totalEnrollments.toLocaleString()}+`,
                    label: "Enrollments",
                  },
                  { value: `${stats.totalInstructors}+`, label: "Instructors" },
                ].map((stat) => (
                  <div key={stat.label}>
                    <div className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{stat.value}</div>
                    <div className={`text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full max-w-md lg:max-w-none flex-1 lg:pl-10 mt-10 lg:mt-0">
              {featuredCourses[0] || courses[0] ? (() => {
                const previewCourse = featuredCourses[0] || courses[0];
                return (
                  <Link href={`/courses/${previewCourse.slug}`} className="block relative aspect-video rounded-2xl overflow-hidden border border-border shadow-2xl bg-black/5 group">
                    {previewCourse.thumbnailUrl ? (
                      <img src={previewCourse.thumbnailUrl} alt={previewCourse.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.25),_transparent_55%),linear-gradient(135deg,_rgba(15,23,42,0.95),_rgba(17,75,95,0.95))] text-white transition-transform duration-500 group-hover:scale-105">
                        <BookOpenIcon className="size-16 opacity-80" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="size-16 rounded-full bg-emerald-600/90 flex items-center justify-center text-white shadow-xl group-hover:scale-110 transition-transform backdrop-blur-sm">
                        <PlayCircleIcon className="size-8 ml-1" />
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                      <h3 className="text-white font-bold text-lg line-clamp-1 drop-shadow-md">{previewCourse.title}</h3>
                      <p className="text-white/80 text-sm drop-shadow-sm">{previewCourse.instructorName}</p>
                    </div>
                  </Link>
                );
              })() : (
                <div className="relative aspect-video rounded-2xl overflow-hidden border border-border shadow-2xl bg-black/5 group">
                  <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.25),_transparent_55%),linear-gradient(135deg,_rgba(15,23,42,0.95),_rgba(17,75,95,0.95))] text-white">
                    <BookOpenIcon className="size-16 opacity-80" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
      )}
      {isStudent && enrolledCourses.length > 0 ? (
        <section className="border-b border-border bg-background/70">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  Continue Learning
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pick up where you left off.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/courses/my">View all</Link>
              </Button>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-2">
              {enrolledCourses.map((course) => (
                <Link
                  key={course._id}
                  href={`/courses/${course.slug}`}
                  className="group flex w-[320px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm transition-all hover:border-emerald-500/40 hover:shadow-md"
                >
                  <div className="relative aspect-[16/9] w-full overflow-hidden">
                    {course.thumbnailUrl ? (
                      <img
                        src={course.thumbnailUrl}
                        alt={course.title}
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.25),_transparent_55%),linear-gradient(135deg,_rgba(15,23,42,0.95),_rgba(17,75,95,0.95))] text-white">
                        <BookOpenIcon className="size-12 transition-transform duration-300 group-hover:scale-110" />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <Badge
                      variant="secondary"
                      className="mb-2 w-fit text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                    >
                      {course.subject}
                    </Badge>
                    <h3 className="line-clamp-2 text-sm font-semibold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                      {course.title}
                    </h3>

                    <div className="mt-3">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{
                            width: `${course.overallProgressPercent ?? 0}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {course.completedVideoCount ?? 0}/
                        {course.totalVideoCount ?? course.lessonsCount} watched
                        {" · "}
                        {Math.round(course.overallProgressPercent ?? 0)}%
                      </p>
                    </div>

                    <div className="mt-auto flex items-center gap-2 pt-3 text-xs text-muted-foreground">
                      <GraduationCapIcon className="size-3.5 text-emerald-600" />
                      {course.instructorName}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {isStudent && enrolledChapters.length > 0 ? (
        <section className="border-b border-border bg-background/70">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">Your Chapters</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Short lessons and document packs you unlocked.
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {enrolledChapters.map((chapter) => (
                <Link
                  key={chapter._id}
                  href={`/chapters/${chapter.slug}`}
                  className="rounded-2xl border border-border bg-background p-4 shadow-sm transition-all hover:border-emerald-500/40"
                >
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                    Chapter
                  </Badge>
                  <h3 className="mt-3 line-clamp-2 font-semibold text-foreground">
                    {chapter.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {chapter.contentsCount} items · {Math.round(chapter.overallProgressPercent ?? 0)}%
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {canManageCourses && managedCourses.length > 0 ? (
        <section className="border-b border-border bg-background/70">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  Your Courses
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Manage content, pricing, and live sessions.
                </p>
              </div>
              <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700">
                <Link href="/studio">
                  <PlusIcon className="mr-1 size-4" />
                  Course Studio
                </Link>
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {managedCourses.map((course) => (
                <Link
                  key={course._id}
                  href={`/courses/${course.slug}/manage`}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-background transition-all hover:border-blue-500/40 hover:shadow-lg"
                >
                  <div className="relative aspect-[16/10] overflow-hidden">
                    {course.thumbnailUrl ? (
                      <img
                        src={course.thumbnailUrl}
                        alt={course.title}
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.25),_transparent_55%),linear-gradient(135deg,_rgba(15,23,42,0.95),_rgba(17,75,95,0.95))] text-white">
                        <BookOpenIcon className="size-10 transition-transform duration-300 group-hover:scale-110" />
                      </div>
                    )}
                    <div className="absolute right-3 top-3">
                      <Badge className={getPricingColor(course.pricingModel)}>
                        {getPricingLabel(course.pricingModel, course.price)}
                      </Badge>
                    </div>
                  </div>

                  <div className="p-4">
                    <h3 className="line-clamp-1 text-sm font-semibold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400">
                      {course.title}
                    </h3>
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Users2Icon className="size-3" />
                        {course.enrollmentCount}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <VideoIcon className="size-3" />
                        {course.lessonsCount}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {canManageCourses && managedChapters.length > 0 ? (
        <section className="border-b border-border bg-background/70">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">Your Chapters</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Manage standalone chapter content.
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/studio">Studio</Link>
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {managedChapters.map((chapter) => (
                <Link
                  key={chapter._id}
                  href={`/studio/chapter/${chapter._id}`}
                  className="rounded-2xl border border-border bg-background p-4 shadow-sm transition-all hover:border-blue-500/40"
                >
                  <Badge variant="outline">Chapter</Badge>
                  <h3 className="mt-3 line-clamp-2 font-semibold text-foreground">
                    {chapter.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {chapter.contentsCount} items · {chapter.enrollmentCount} learners
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {featuredCourses.length > 0 ? (
        <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-foreground">Featured</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Hand-picked courses worth checking out first.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featuredCourses.slice(0, 3).map((course) => (
              <Link
                key={course._id}
                href={`/courses/${course.slug}`}
                className="group overflow-hidden rounded-3xl border border-border bg-background shadow-sm transition-all hover:border-emerald-500/40 hover:shadow-lg"
              >
                <div className="relative aspect-[16/9] overflow-hidden">
                  {course.thumbnailUrl ? (
                    <img
                      src={course.thumbnailUrl}
                      alt={course.title}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.25),_transparent_55%),linear-gradient(135deg,_rgba(15,23,42,0.95),_rgba(17,75,95,0.95))] text-white">
                      <BookOpenIcon className="size-12 transition-transform duration-300 group-hover:scale-110" />
                    </div>
                  )}
                </div>

                <div className="space-y-3 p-5">
                  <div className="flex flex-wrap gap-2">
                    {typeof course.overallProgressPercent === "number" ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400">
                        Enrolled
                      </Badge>
                    ) : (
                      <Badge className={getPricingColor(course.pricingModel)}>
                        {getPricingLabel(course.pricingModel, course.price)}
                      </Badge>
                    )}
                    <Badge variant="outline">{course.subject}</Badge>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                    {course.title}
                  </h3>
                  <p className="line-clamp-2 text-sm text-muted-foreground whitespace-pre-wrap">
                    {course.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {featuredChapters.length > 0 ? (
        <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-foreground">Featured Chapters</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Focused standalone lessons with videos and documents.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featuredChapters.slice(0, 3).map((chapter) => (
              <Link
                key={chapter._id}
                href={`/chapters/${chapter.slug}`}
                className="group overflow-hidden rounded-3xl border border-border bg-background shadow-sm transition-all hover:border-emerald-500/40"
              >
                <div className="relative aspect-[16/9] overflow-hidden bg-emerald-950 text-white">
                  {chapter.thumbnailUrl ? (
                    <img src={chapter.thumbnailUrl} alt={chapter.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <BookOpenIcon className="size-12" />
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <Badge className={getPricingColor(chapter.pricingModel)}>
                    {getPricingLabel(chapter.pricingModel, chapter.price)}
                  </Badge>
                  <h3 className="mt-3 line-clamp-2 text-lg font-semibold text-foreground">
                    {chapter.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {chapter.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section id="browse" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search courses by title, instructor, or topic..."
              className="h-12 pl-10 text-sm"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <select
              value={pricingFilter}
              onChange={(event) => setPricingFilter(event.target.value)}
              className="h-12 rounded-xl border border-input bg-background px-3 text-sm"
            >
              {PRICING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={subjectFilter}
              onChange={(event) => setSubjectFilter(event.target.value)}
              className="hidden h-12 rounded-xl border border-input bg-background px-3 text-sm sm:block"
            >
              <option value="">All subjects</option>
              {subjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
            <select
              value={levelFilter}
              onChange={(event) => setLevelFilter(event.target.value)}
              className="hidden h-12 rounded-xl border border-input bg-background px-3 text-sm md:block"
            >
              <option value="">All levels</option>
              {levels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-foreground">
            All Courses
            <span className="ml-2 inline-flex h-7 min-w-[28px] items-center justify-center rounded-full bg-emerald-100 px-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
              {filteredCourses.length}
            </span>
          </h2>
        </div>

        {filteredChapters.length > 0 ? (
          <div className="mb-10">
            <h2 className="mb-4 text-xl font-bold text-foreground">
              Chapters
              <span className="ml-2 inline-flex h-7 min-w-[28px] items-center justify-center rounded-full bg-blue-100 px-2 text-sm font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                {filteredChapters.length}
              </span>
            </h2>
            <div className="space-y-4">
              {filteredChapters.map((chapter) => (
                <Link
                  key={chapter._id}
                  href={`/chapters/${chapter.slug}`}
                  className="group flex flex-col gap-4 rounded-2xl border border-border bg-background p-4 shadow-sm transition-all hover:border-blue-500/40 sm:flex-row sm:items-center sm:p-5"
                >
                  <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden rounded-xl bg-blue-950 text-white sm:h-28 sm:w-48">
                    {chapter.thumbnailUrl ? (
                      <img src={chapter.thumbnailUrl} alt={chapter.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <BookOpenIcon className="size-10" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Badge variant="secondary" className="mb-2">Chapter</Badge>
                    <h3 className="line-clamp-1 text-base font-semibold text-foreground">
                      {chapter.title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {chapter.description}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{chapter.subject}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {chapter.contentsCount} items
                      </span>
                    </div>
                  </div>
                  <Badge className={getPricingColor(chapter.pricingModel)}>
                    {getPricingLabel(chapter.pricingModel, chapter.price)}
                  </Badge>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {filteredCourses.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-background p-16 text-center text-sm text-muted-foreground">
            No courses match your search or filters.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredCourses.map((course) => (
              <Link
                key={course._id}
                href={`/courses/${course.slug}`}
                className="group flex flex-col gap-4 rounded-2xl border border-border bg-background p-4 shadow-sm transition-all hover:border-emerald-500/40 hover:shadow-md sm:flex-row sm:items-center sm:p-5"
              >
                <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden rounded-xl sm:h-28 sm:w-48">
                  {course.thumbnailUrl ? (
                    <img
                      src={course.thumbnailUrl}
                      alt={course.title}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.25),_transparent_55%),linear-gradient(135deg,_rgba(15,23,42,0.95),_rgba(17,75,95,0.95))] text-white">
                      <BookOpenIcon className="size-10 transition-transform duration-300 group-hover:scale-110" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-1 text-base font-semibold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                    {course.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {course.lessonsCount} lessons
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground whitespace-pre-wrap">
                    {course.description}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-[11px]">
                      {course.subject}
                    </Badge>
                    <Badge variant="outline" className="text-[11px]">
                      {course.level}
                    </Badge>
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      ·
                    </span>
                    <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
                      <Users2Icon className="size-3" />
                      {course.enrollmentCount} enrolled
                    </span>
                    <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
                      <Clock3Icon className="size-3" />
                      {formatDuration(course.totalDurationMinutes)}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2 sm:min-w-[140px]">
                  {typeof course.overallProgressPercent === "number" ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400">
                      Enrolled
                    </Badge>
                  ) : course.pricingModel === "PAID" && course.price ? (
                    <div className="text-right">
                      <div className="text-lg font-bold text-foreground">
                        NPR {course.price.toLocaleString()}
                      </div>
                    </div>
                  ) : (
                    <Badge className={getPricingColor(course.pricingModel)}>
                      {getPricingLabel(course.pricingModel, course.price)}
                    </Badge>
                  )}

                  {typeof course.overallProgressPercent === "number" ? (
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      {Math.round(course.overallProgressPercent)}% complete
                    </span>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
