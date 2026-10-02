"use client";
import { formatDuration } from "@/lib/duration";


import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpenIcon,
  ChevronRightIcon,
  EyeIcon,
  PlusIcon,
  SearchIcon,
  Users2Icon,
  VideoIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreateCourseModal } from "@/components/course/CreateCourseModal";
import { CreateChapterModal } from "@/components/chapter/CreateChapterModal";
import { COURSE_UPDATED_EVENT, COURSE_UPDATES_CHANNEL } from "@/lib/pusher/events";
import { getPusherClient } from "@/lib/pusher/pusherClient";

type StudioCourse = {
  _id: string;
  slug: string;
  title: string;
  description: string;
  subject: string;
  level: string;
  pricingModel: "FREE" | "SUBSCRIPTION_INCLUDED" | "PAID";
  price: number | null;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
  thumbnailUrl: string | null;
  totalDurationMinutes: number;
  enrollmentCount: number;
  videoCount: number;
  createdAt: string;
};

type Props = {
  courses: StudioCourse[];
  chapters: StudioChapter[];
  userRole: string;
};

type StudioChapter = Omit<StudioCourse, "videoCount"> & {
  contentCount: number;
};

export function CourseStudioClient({ courses, chapters, userRole }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateChapterModal, setShowCreateChapterModal] = useState(false);

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      const matchesSearch =
        !search || course.title.toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        filterStatus === "all" || course.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [courses, filterStatus, search]);

  const filteredChapters = useMemo(() => {
    return chapters.filter((chapter) => {
      const matchesSearch =
        !search || chapter.title.toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        filterStatus === "all" || chapter.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [chapters, filterStatus, search]);

  const stats = useMemo(
    () => ({
      totalCourses: courses.length + chapters.length,
      activeCourses: courses.filter((course) => course.status === "ACTIVE").length,
      totalStudents: courses.reduce(
        (acc, course) => acc + course.enrollmentCount,
        0,
      ) + chapters.reduce((acc, chapter) => acc + chapter.enrollmentCount, 0),
      totalVideos: courses.reduce((acc, course) => acc + course.videoCount, 0) +
        chapters.reduce((acc, chapter) => acc + chapter.contentCount, 0),
    }),
    [chapters, courses],
  );

  useEffect(() => {
    const client = getPusherClient();

    if (!client) {
      return;
    }

    const channel = client.subscribe(COURSE_UPDATES_CHANNEL);
    const handleCourseUpdated = () => {
      router.refresh();
    };

    channel.bind(COURSE_UPDATED_EVENT, handleCourseUpdated);

    return () => {
      channel.unbind(COURSE_UPDATED_EVENT, handleCourseUpdated);
      client.unsubscribe(COURSE_UPDATES_CHANNEL);
    };
  }, [router]);

  function getStatusColor(status: string) {
    switch (status) {
      case "ACTIVE":
        return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400";
      case "DRAFT":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400";
      case "COMPLETED":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400";
      case "ARCHIVED":
        return "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  }

  function getPricingLabel(model: string, price: number | null) {
    if (model === "FREE") return "Free";
    if (model === "SUBSCRIPTION_INCLUDED") return "Sub";
    return `₹${(price || 0).toLocaleString()}`;
  }

  return (
    <div className="min-h-svh bg-[#f6f8fb] dark:bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground">
              <Link href="/courses">
                <ChevronRightIcon className="size-5 rotate-180" />
              </Link>
            </Button>
            <div className="h-6 w-px bg-border max-sm:hidden" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600">
                <PlayIcon className="size-4 text-white" />
              </div>
              <span className="text-lg font-bold">Course Studio</span>
              <span className="ml-2 inline-flex items-center rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600 ring-1 ring-inset ring-red-600/20 dark:bg-red-900/40 dark:text-red-400">
                {userRole}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={() => setShowCreateModal(true)}
            >
              <PlusIcon className="size-4 mr-2" />
              New Course
            </Button>
            <Button variant="outline" onClick={() => setShowCreateChapterModal(true)}>
              <PlusIcon className="size-4 mr-2" />
              New Chapter
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Stats Overview */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
                <BookOpenIcon className="size-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.totalCourses}</div>
                <div className="text-xs text-muted-foreground">Studio Items</div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                <EyeIcon className="size-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.activeCourses}</div>
                <div className="text-xs text-muted-foreground">Active</div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/40">
                <Users2Icon className="size-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.totalStudents}</div>
                <div className="text-xs text-muted-foreground">Students</div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
                <VideoIcon className="size-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.totalVideos}</div>
                <div className="text-xs text-muted-foreground">Content Items</div>
              </div>
            </div>
          </div>
        </div>

        {/* Course List */}
        <div className="rounded-xl border border-border bg-background">
          {/* Toolbar */}
          <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search courses..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="all">All status</option>
                <option value="ACTIVE">Active</option>
                <option value="DRAFT">Draft</option>
                <option value="COMPLETED">Completed</option>
                <option value="ARCHIVED">Archived</option>
              </select>
              <Button onClick={() => setShowCreateModal(true)}>
                <PlusIcon className="size-4 mr-2" />
                Create
              </Button>
              <Button variant="outline" onClick={() => setShowCreateChapterModal(true)}>
                <PlusIcon className="size-4 mr-2" />
                Chapter
              </Button>
            </div>
          </div>

          {filteredChapters.length > 0 ? (
            <div className="border-b border-border">
              <div className="bg-muted/20 px-4 py-3 text-sm font-semibold">
                Chapters
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <tbody>
                    {filteredChapters.map((chapter) => (
                      <tr key={chapter._id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                              <BookOpenIcon className="size-5 text-emerald-600" />
                            </div>
                            <div>
                              <div className="font-medium line-clamp-1">{chapter.title}</div>
                              <div className="text-xs text-muted-foreground line-clamp-1">
                                {chapter.subject} · {chapter.level}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={getStatusColor(chapter.status)}>
                            {chapter.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {getPricingLabel(chapter.pricingModel, chapter.price)}
                        </td>
                        <td className="hidden px-4 py-3 text-sm md:table-cell">
                          {chapter.enrollmentCount}
                        </td>
                        <td className="hidden px-4 py-3 text-sm md:table-cell">
                          {chapter.contentCount}
                        </td>
                        <td className="px-4 py-3">
                          <Button size="sm" variant="ghost" asChild>
                            <Link href={`/studio/chapter/${chapter._id}`}>
                              Manage
                              <ChevronRightIcon className="size-3 ml-1" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* Course Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-sm">
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Pricing</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Students</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Videos</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">Duration</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCourses.map((course) => (
                  <tr
                    key={course._id}
                    className="border-b last:border-0 hover:bg-muted/20"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-slate-800 to-emerald-900 flex items-center justify-center">
                          <BookOpenIcon className="size-5 text-emerald-500/50" />
                        </div>
                        <div>
                          <div className="font-medium line-clamp-1">{course.title}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {course.subject} · {course.level}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={getStatusColor(course.status)}>
                        {course.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {getPricingLabel(course.pricingModel, course.price)}
                    </td>
                    <td className="px-4 py-3 text-sm hidden md:table-cell">
                      {course.enrollmentCount}
                    </td>
                    <td className="px-4 py-3 text-sm hidden md:table-cell">
                      {course.videoCount}
                    </td>
                    <td className="px-4 py-3 text-sm hidden lg:table-cell">
                      {formatDuration(course.totalDurationMinutes)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/courses/${course.slug}/manage`}>
                            Manage
                            <ChevronRightIcon className="size-3 ml-1" />
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredCourses.length === 0 && (
            <div className="p-12 text-center">
              <BookOpenIcon className="mx-auto size-10 text-muted-foreground/40" />
              <h3 className="mt-4 font-semibold">No courses found</h3>
              <p className="text-sm text-muted-foreground">
                Create your first course to get started.
              </p>
              <Button
                className="mt-4 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setShowCreateModal(true)}
              >
                <PlusIcon className="size-4 mr-2" />
                Create Course
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Create Course Modal */}
      <CreateCourseModal open={showCreateModal} onOpenChange={setShowCreateModal} />
      <CreateChapterModal
        open={showCreateChapterModal}
        onOpenChange={setShowCreateChapterModal}
      />
    </div>
  );
}

function PlayIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <path d="M8 6.82v10.36c0 .79.71 1.28 1.53.85l6.15-5.18c.64-.51 1.32-.51 1.96 0l6.15 5.18c.82.64 1.53-.06 1.53-.85V6.82c0-1.12-.94-2.02-2.06-2.02H10.06c-1.12 0-2.06.9-2.06 2.02z" />
    </svg>
  );
}
