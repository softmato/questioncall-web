"use client";
import { formatDuration } from "@/lib/duration";


import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, GitMergeIcon, UsersIcon, VideoIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CourseRow = {
  _id: string;
  title: string;
  slug: string;
  status: string;
  instructorId: string;
  instructorName: string;
  enrollmentCount: number;
  videoCount: number;
};

type SourceImpact = {
  courseId: string;
  title: string;
  sections: number;
  videos: number;
  enrollments: number;
  enrollmentCollisions: number;
  videoProgressRows: number;
  activeCoupons: number;
  liveSessions: number;
};

type DryRunReport = {
  target: { courseId: string | null; title: string; isNew: boolean };
  sources: SourceImpact[];
  projectedStudentCount: number;
  projectedVideoCount: number;
};

type MergeResult = {
  target: { courseId: string; title: string; slug: string; isNew: boolean };
  sources: SourceImpact[];
  deactivatedCoupons: number;
  targetTotals: {
    totalVideoCount: number;
    totalDurationMinutes: number;
    enrollmentCount: number;
  };
};

export function AdminCourseMergeClient({ courses }: { courses: CourseRow[] }) {
  const [instructorId, setInstructorId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [wrapSources, setWrapSources] = useState(true);

  const [isWorking, setIsWorking] = useState(false);
  const [report, setReport] = useState<DryRunReport | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<MergeResult | null>(null);

  const instructors = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; courseCount: number }>();
    for (const course of courses) {
      const entry = byId.get(course.instructorId);
      if (entry) {
        entry.courseCount += 1;
      } else {
        byId.set(course.instructorId, {
          id: course.instructorId,
          name: course.instructorName,
          courseCount: 1,
        });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [courses]);

  const instructorCourses = useMemo(
    () => courses.filter((course) => course.instructorId === instructorId),
    [courses, instructorId],
  );

  const selectedCourses = useMemo(
    () =>
      selectedIds
        .map((id) => courses.find((course) => course._id === id))
        .filter((course): course is CourseRow => Boolean(course)),
    [courses, selectedIds],
  );

  function resetInstructor(nextInstructorId: string) {
    setInstructorId(nextInstructorId);
    setSelectedIds([]);
    setNewCourseTitle("");
    setReport(null);
    setResult(null);
  }

  function toggleCourse(courseId: string) {
    setReport(null);
    setSelectedIds((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId],
    );
  }

  async function runMerge(dryRun: boolean) {
    if (selectedIds.length < 2 || !newCourseTitle.trim()) return;
    setIsWorking(true);
    try {
      const response = await fetch("/api/admin/courses/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceCourseIds: selectedIds,
          newCourseTitle: newCourseTitle.trim(),
          dryRun,
          wrapSourcesAsSections: wrapSources,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Merge failed.");

      if (dryRun) {
        setReport(data as DryRunReport);
      } else {
        setResult(data as MergeResult);
        setConfirming(false);
        toast.success("Courses merged.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Merge failed.");
      setConfirming(false);
    } finally {
      setIsWorking(false);
    }
  }

  const canPreview = selectedIds.length >= 2 && newCourseTitle.trim().length > 0;

  // ── Result screen ────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Merge complete</h1>
        <div className="space-y-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-6">
          <p className="text-sm text-foreground">
            Created <strong>{result.target.title}</strong> from{" "}
            <strong>{result.sources.length}</strong> courses.
          </p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>
              <strong>{result.targetTotals.enrollmentCount}</strong> students were
              transferred into the merged course, keeping their watch progress.
            </li>
            <li>
              It now holds <strong>{result.targetTotals.totalVideoCount}</strong> ready
              videos ({formatDuration(result.targetTotals.totalDurationMinutes)}).
            </li>
            {result.deactivatedCoupons > 0 && (
              <li>
                {result.deactivatedCoupons} course-scoped coupon
                {result.deactivatedCoupons > 1 ? "s were" : " was"} deactivated —
                recreate them on the merged course if still needed.
              </li>
            )}
            <li>
              The original courses are archived; their old links redirect here.
            </li>
          </ul>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href={`/courses/${result.target.slug}`}>View merged course</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/courses">Back to courses</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/courses">
            <ArrowLeftIcon className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Merge courses</h1>
          <p className="text-sm text-muted-foreground">
            Pick the duplicate courses, name the course they should become, and every
            video and student moves into it.
          </p>
        </div>
      </div>

      {/* Step 1 — instructor */}
      <div className="space-y-2">
        <Label>1. Instructor</Label>
        <select
          value={instructorId}
          onChange={(e) => resetInstructor(e.target.value)}
          className="h-10 w-full max-w-md rounded-xl border border-input bg-background px-3 text-sm"
        >
          <option value="">Select an instructor…</option>
          {instructors.map((instructor) => (
            <option key={instructor.id} value={instructor.id}>
              {instructor.name} ({instructor.courseCount} course
              {instructor.courseCount > 1 ? "s" : ""})
            </option>
          ))}
        </select>
      </div>

      {/* Step 2 — courses to merge */}
      {instructorId && (
        <div className="space-y-2">
          <Label>2. Courses to merge together</Label>
          <div className="rounded-2xl border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-sm text-muted-foreground">
                  <th className="w-12 px-4 py-3 font-medium">Merge</th>
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Videos</th>
                  <th className="px-4 py-3 font-medium">Students</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {instructorCourses.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-sm text-muted-foreground"
                    >
                      This instructor has no mergeable courses.
                    </td>
                  </tr>
                )}
                {instructorCourses.map((course) => {
                  const order = selectedIds.indexOf(course._id);
                  return (
                    <tr key={course._id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={order !== -1}
                          onChange={() => toggleCourse(course._id)}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">
                        {course.title}
                        {order === 0 && (
                          <Badge variant="secondary" className="ml-2">
                            settings template
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {course.videoCount}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {course.enrollmentCount}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{course.status}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {selectedCourses.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {selectedCourses.length} selected ·{" "}
              {selectedCourses.reduce((sum, c) => sum + c.videoCount, 0)} videos ·{" "}
              {selectedCourses.reduce((sum, c) => sum + c.enrollmentCount, 0)} student
              enrollments. Pricing, description and thumbnail are inherited from the
              first course you tick.
            </p>
          )}
        </div>
      )}

      {/* Step 3 — name + options */}
      {selectedIds.length >= 2 && (
        <div className="space-y-4">
          <div className="max-w-md space-y-2">
            <Label htmlFor="merged-title">3. Name of the merged course</Label>
            <Input
              id="merged-title"
              value={newCourseTitle}
              onChange={(e) => {
                setReport(null);
                setNewCourseTitle(e.target.value);
              }}
              placeholder="e.g. Complete Physics Grade 12"
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">
              A new course is created with this name. The selected courses are archived
              once their content and students move over.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={wrapSources}
              onChange={(e) => {
                setReport(null);
                setWrapSources(e.target.checked);
              }}
            />
            Turn each merged course into its own section (named after that course)
          </label>

          <Button onClick={() => runMerge(true)} disabled={isWorking || !canPreview}>
            <GitMergeIcon className="mr-1 size-4" />
            {isWorking && !confirming ? "Checking…" : "Preview merge"}
          </Button>
        </div>
      )}

      {/* Step 4 — dry-run report */}
      {report && (
        <div className="space-y-4 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5">
          <p className="text-sm text-foreground">
            Will create <strong>{report.target.title}</strong> containing:
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-foreground">
              <UsersIcon className="size-4 text-muted-foreground" />
              <strong>{report.projectedStudentCount}</strong> students
            </span>
            <span className="flex items-center gap-1.5 text-foreground">
              <VideoIcon className="size-4 text-muted-foreground" />
              <strong>{report.projectedVideoCount}</strong> videos
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Course</th>
                  <th className="px-2 py-2 font-medium">Sections</th>
                  <th className="px-2 py-2 font-medium">Videos</th>
                  <th className="px-2 py-2 font-medium">Students</th>
                  <th className="px-2 py-2 font-medium">Duplicate students</th>
                  <th className="px-2 py-2 font-medium">Progress rows</th>
                  <th className="px-2 py-2 font-medium">Active coupons</th>
                </tr>
              </thead>
              <tbody>
                {report.sources.map((source) => (
                  <tr key={source.courseId} className="border-b last:border-0">
                    <td className="px-2 py-2 font-medium text-foreground">
                      {source.title}
                    </td>
                    <td className="px-2 py-2">{source.sections}</td>
                    <td className="px-2 py-2">{source.videos}</td>
                    <td className="px-2 py-2">{source.enrollments}</td>
                    <td className="px-2 py-2">{source.enrollmentCollisions}</td>
                    <td className="px-2 py-2">{source.videoProgressRows}</td>
                    <td className="px-2 py-2">{source.activeCoupons}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            &quot;Duplicate students&quot; were already counted by an earlier course in
            this merge — they get a single enrollment in the merged course.
          </p>
          <Button variant="destructive" onClick={() => setConfirming(true)}>
            Merge now
          </Button>
        </div>
      )}

      {/* Confirm dialog */}
      <Dialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Merge {selectedIds.length} courses into &quot;{newCourseTitle.trim()}&quot;?
            </DialogTitle>
            <DialogDescription>
              A new course is created with that name. All videos, sections, enrollments
              and watch progress move into it, and the {selectedIds.length} selected
              courses are archived with their links redirecting to the new one. This
              cannot be undone from the UI.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => runMerge(false)}
              disabled={isWorking}
            >
              {isWorking ? "Merging…" : "Create merged course"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
