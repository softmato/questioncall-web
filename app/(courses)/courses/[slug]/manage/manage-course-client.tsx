"use client";
import { formatDuration } from "@/lib/duration";


import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MuxPlayer } from "@/components/shared/lazy-mux-player";
import {
  ArrowLeftIcon,
  BarChart3Icon,
  BookOpenIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EyeIcon,
  GripVerticalIcon,
  LayoutGridIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  Trash2Icon,
  Users2Icon,
  VideoIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LiveSessionManager } from "@/components/course/LiveSessionManager";
import { AddContentModal } from "@/components/course/AddContentModal";
import { CourseCouponsManager } from "@/components/course/CourseCouponsManager";
import { TicketIcon } from "lucide-react";
import type { ManageCourseData } from "@/lib/course-page-data";

type Tab = "content" | "details" | "live" | "analytics" | "coupons";

const TABS: { id: Tab; label: string; icon: typeof LayoutGridIcon }[] = [
  { id: "content", label: "Curriculum", icon: LayoutGridIcon },
  { id: "details", label: "Settings", icon: SettingsIcon },
  { id: "live", label: "Live Sessions", icon: CalendarIcon },
  { id: "analytics", label: "Analytics", icon: BarChart3Icon },
  { id: "coupons", label: "Coupons", icon: TicketIcon },
];

type EnrolledUser = {
  id: string;
  accessType: string;
  enrolledAt: string | null;
  lastAccessedAt: string | null;
  overallProgressPercent: number;
  completedVideoCount: number;
  totalVideoCount: number;
  student: {
    id: string;
    name: string;
    email: string;
    username: string;
    userImage: string | null;
  };
};

// ─── Component ──────────────────────────────────────────────────────────────

export function ManageCourseClient({
  course,
  sections: initialSections,
  liveSessions: initialLiveSessions,
  analytics,
  commissionPercent,
}: ManageCourseData) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("content");

  // ── Details form ──
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    title: course.title,
    description: course.description,
    subject: course.subject,
    level: course.level,
    pricingModel: course.pricingModel,
    price: course.price,
    status: course.status,
    freePreviewCount: course.freePreviewCount ?? 0,
  });

  // ── Sections state ──
  const [sections, setSections] = useState(initialSections);

  // ── New section dialog ──
  const [showAddSection, setShowAddSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [isAddingSection, setIsAddingSection] = useState(false);

  // ── Add content modal ──
  const [showAddContent, setShowAddContent] = useState(false);
  const [addContentSectionId, setAddContentSectionId] = useState<string | null>(null);

  // ── Editing section ──
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editSectionTitle, setEditSectionTitle] = useState("");

  // ── Collapsed sections ──
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [showEnrolledUsers, setShowEnrolledUsers] = useState(false);
  const [enrolledUsers, setEnrolledUsers] = useState<EnrolledUser[]>([]);
  const [loadingEnrolledUsers, setLoadingEnrolledUsers] = useState(false);
  const [enrolledUsersLoaded, setEnrolledUsersLoaded] = useState(false);
  const [enrollmentSearch, setEnrollmentSearch] = useState("");

  // ── Video player modal ──
  const [playingVideo, setPlayingVideo] = useState<{
    title: string;
    muxPlaybackId: string | null;
    videoUrl: string | null;
  } | null>(null);

  const toggleSection = (sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  // ── Save details ──
  const handleSaveDetails = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/courses/${course._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          freePreviewCount: form.pricingModel === "FREE" ? 0 : form.freePreviewCount,
        }),
      });
      if (!res.ok) throw new Error("Failed to update course");
      toast.success("Course details saved!");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const fetchEnrolledUsers = async () => {
    setLoadingEnrolledUsers(true);
    try {
      const res = await fetch(`/api/courses/${course._id}/enrollments`);
      if (!res.ok) {
        throw new Error("Failed to load enrolled users");
      }

      const data = (await res.json()) as { enrollments?: EnrolledUser[] };
      setEnrolledUsers(Array.isArray(data.enrollments) ? data.enrollments : []);
      setEnrolledUsersLoaded(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load enrolled users");
    } finally {
      setLoadingEnrolledUsers(false);
    }
  };

  const openEnrolledUsersModal = async () => {
    setShowEnrolledUsers(true);
    if (!enrolledUsersLoaded) {
      await fetchEnrolledUsers();
    }
  };

  // ── Add section ──
  const handleAddSection = async () => {
    if (!newSectionTitle.trim()) return;
    setIsAddingSection(true);
    try {
      const res = await fetch(`/api/courses/${course._id}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newSectionTitle.trim() }),
      });
      if (!res.ok) throw new Error("Failed to add section");
      const newSection = await res.json();
      setSections((prev) => [...prev, { ...newSection, videos: [] }]);
      setNewSectionTitle("");
      setShowAddSection(false);
      toast.success("Section added!");
    } catch {
      toast.error("Failed to add section");
    } finally {
      setIsAddingSection(false);
    }
  };

  // ── Delete section ──
  const handleDeleteSection = async (sectionId: string) => {
    if (!confirm("Delete this section and all its videos?")) return;
    try {
      const res = await fetch(
        `/api/courses/${course._id}/sections/${sectionId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed");
      setSections((prev) => prev.filter((s) => s._id !== sectionId));
      toast.success("Section deleted");
      router.refresh();
    } catch {
      toast.error("Failed to delete section");
    }
  };

  // ── Rename section ──
  const handleRenameSection = async (sectionId: string) => {
    if (!editSectionTitle.trim()) return;
    try {
      const res = await fetch(
        `/api/courses/${course._id}/sections/${sectionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: editSectionTitle.trim() }),
        },
      );
      if (!res.ok) throw new Error("Failed");
      setSections((prev) =>
        prev.map((s) =>
          s._id === sectionId ? { ...s, title: editSectionTitle.trim() } : s,
        ),
      );
      setEditingSectionId(null);
      toast.success("Section renamed");
    } catch {
      toast.error("Failed to rename section");
    }
  };

  // ── Refresh sections when upload completes ──
  const handleUploadSuccess = () => {
    router.refresh();
    fetch(`/api/courses/${course._id}/sections`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data?.sections) setSections(data.sections); });
  };

  // ── Delete video ──
  const handleDeleteVideo = async (videoId: string) => {
    if (!confirm("Delete this video?")) return;
    try {
      const res = await fetch(
        `/api/courses/${course._id}/videos/${videoId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed");
      setSections((prev) =>
        prev.map((s) => ({
          ...s,
          videos: s.videos.filter((v) => v._id !== videoId),
        })),
      );
      toast.success("Video deleted");
      router.refresh();
    } catch {
      toast.error("Failed to delete video");
    }
  };

  // ── Helpers ──


  function getStatusBadge(status: string) {
    const map: Record<string, string> = {
      DRAFT: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
      ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
      COMPLETED: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
      ARCHIVED: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    };
    return map[status] || "bg-muted text-muted-foreground";
  }

  function getPricingLabel() {
    if (course.pricingModel === "FREE") return "Free";
    if (course.pricingModel === "SUBSCRIPTION_INCLUDED") return "Subscription";
    return `NPR ${(course.price ?? 0).toLocaleString()}`;
  }

  const totalVideos = Array.isArray(sections) ? sections.reduce((a, s) => a + (s.videos?.length || 0), 0) : 0;
  const filteredEnrolledUsers = enrolledUsers.filter((enrollment) => {
    const query = enrollmentSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return [
      enrollment.student.name,
      enrollment.student.email,
      enrollment.student.username,
    ]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query));
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-svh bg-[#fafbfc] dark:bg-background">
      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
          <Button variant="ghost" size="icon" className="shrink-0" asChild>
            <Link href="/studio">
              <ArrowLeftIcon className="size-4" />
            </Link>
          </Button>

          <div className="flex items-center gap-2 text-sm min-w-0">
            <Link
              href="/studio"
              className="hidden sm:inline text-muted-foreground hover:text-foreground transition-colors"
            >
              Studio
            </Link>
            <ChevronRightIcon className="hidden sm:inline size-3 text-muted-foreground/50" />
            <span className="font-semibold text-foreground truncate">
              {course.title}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Badge className={`${getStatusBadge(course.status)} text-xs`}>
              {course.status}
            </Badge>
            <Badge variant="outline" className="text-xs hidden sm:inline-flex">
              {getPricingLabel()}
            </Badge>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/courses/${course.slug}`}>
                <EyeIcon className="size-3.5 mr-1.5" />
                Preview
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* ── Sidebar ── */}
          <aside className="w-full shrink-0 lg:w-56">
            <nav className="space-y-1 lg:sticky lg:top-20">
              {TABS.map((tab) => {
                if (tab.id === "live" && !course.liveSessionsEnabled) return null;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-all ${
                      activeTab === tab.id
                        ? "bg-emerald-50 text-emerald-700 font-medium dark:bg-emerald-950/30 dark:text-emerald-400"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    <tab.icon className="size-4" />
                    {tab.label}
                    {tab.id === "content" && totalVideos > 0 && (
                      <span className="ml-auto text-xs opacity-60">{totalVideos}</span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Mini stats on sidebar */}
            <div className="mt-6 space-y-3 hidden lg:block">
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Users2Icon className="size-3.5" />
                  Students
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-lg font-bold">{analytics.enrollmentCount}</div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 px-2 text-[10px] uppercase text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/50" 
                    onClick={() => void openEnrolledUsersModal()}
                  >
                    See All
                  </Button>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <VideoIcon className="size-3.5" />
                  Videos
                </div>
                <div className="text-lg font-bold">{totalVideos}</div>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <BarChart3Icon className="size-3.5" />
                  Avg Progress
                </div>
                <div className="text-lg font-bold">{analytics.avgProgressPercent}%</div>
              </div>
            </div>
          </aside>

          {/* ── Main Panel ── */}
          <main className="flex-1 min-w-0">
            {/* ════════ CONTENT TAB ════════ */}
            {activeTab === "content" && (
              <div className="space-y-6">
                {/* Toolbar */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">Curriculum</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {sections?.length || 0} section{(sections?.length || 0) !== 1 && "s"} · {totalVideos} video{totalVideos !== 1 && "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void openEnrolledUsersModal()}
                      disabled={analytics.enrollmentCount === 0}
                    >
                      <Users2Icon className="size-4 mr-1.5" />
                      Show Users
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setShowAddSection(true)}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      <PlusIcon className="size-4 mr-1.5" />
                      Add Section
                    </Button>
                  </div>
                </div>

                {/* Add section inline form */}
                {showAddSection && (
                  <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/10 p-4">
                    <div className="flex items-end gap-3">
                      <div className="flex-1 space-y-1.5">
                        <Label className="text-xs">Section Title</Label>
                        <Input
                          value={newSectionTitle}
                          onChange={(e) => setNewSectionTitle(e.target.value)}
                          placeholder="e.g. Introduction to System Design"
                          autoFocus
                          onKeyDown={(e) => e.key === "Enter" && handleAddSection()}
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={handleAddSection}
                        disabled={!newSectionTitle.trim() || isAddingSection}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        {isAddingSection ? (
                          <Loader2Icon className="size-4 animate-spin" />
                        ) : (
                          "Add"
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setShowAddSection(false);
                          setNewSectionTitle("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Sections list */}
                {(sections?.length ?? 0) === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-border bg-background p-12 text-center">
                    <BookOpenIcon className="mx-auto size-10 text-muted-foreground/30 mb-4" />
                    <h3 className="font-semibold text-foreground">No sections yet</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Start building your curriculum by adding a section.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sections.map((section, sIdx) => {
                      const isCollapsed = collapsedSections.has(section._id);
                      const isEditing = editingSectionId === section._id;

                      return (
                        <div
                          key={section._id}
                          className="rounded-xl border border-border bg-background shadow-sm overflow-hidden"
                        >
                          {/* Section header */}
                          <div className="flex items-center gap-3 px-4 py-3 bg-muted/20">
                            <GripVerticalIcon className="size-4 text-muted-foreground/40 shrink-0 cursor-grab" />

                            <button
                              onClick={() => toggleSection(section._id)}
                              className="shrink-0"
                            >
                              <ChevronDownIcon
                                className={`size-4 text-muted-foreground transition-transform ${
                                  isCollapsed ? "-rotate-90" : ""
                                }`}
                              />
                            </button>

                            {isEditing ? (
                              <div className="flex flex-1 items-center gap-2">
                                <Input
                                  value={editSectionTitle}
                                  onChange={(e) => setEditSectionTitle(e.target.value)}
                                  className="h-8 text-sm"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleRenameSection(section._id);
                                    if (e.key === "Escape") setEditingSectionId(null);
                                  }}
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleRenameSection(section._id)}
                                >
                                  Save
                                </Button>
                              </div>
                            ) : (
                              <div className="flex flex-1 items-center gap-2 min-w-0">
                                <span className="text-xs font-bold text-muted-foreground">
                                  {String(sIdx + 1).padStart(2, "0")}
                                </span>
                                <span className="font-medium text-foreground truncate">
                                  {section.title}
                                </span>
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {section.videos?.length || 0} video{(section.videos?.length || 0) !== 1 && "s"}
                                </span>
                              </div>
                            )}

                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                onClick={() => {
                                  setEditingSectionId(section._id);
                                  setEditSectionTitle(section.title);
                                }}
                              >
                                <PencilIcon className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-red-500 hover:text-red-600"
                                onClick={() => handleDeleteSection(section._id)}
                              >
                                <Trash2Icon className="size-3.5" />
                              </Button>
                            </div>
                          </div>

                          {/* Section content */}
                          {!isCollapsed && (
                            <div className="border-t border-border">
                              {!(section.videos?.length) ? (
                                <div className="p-6 text-center text-sm text-muted-foreground">
                                  No videos in this section yet.
                                </div>
                              ) : (
                                <div className="divide-y divide-border">
                                  {section.videos?.map((video, vIdx) => {
                                    const isProcessing = video.status === "PROCESSING";
                                    const canPlay =
                                      !isProcessing &&
                                      Boolean(video.muxPlaybackId || video.videoUrl);
                                    const openPlayer = () =>
                                      setPlayingVideo({
                                        title: video.title,
                                        muxPlaybackId: video.muxPlaybackId,
                                        videoUrl: video.videoUrl,
                                      });
                                    return (
                                      <div
                                        key={video._id}
                                        role={canPlay ? "button" : undefined}
                                        tabIndex={canPlay ? 0 : undefined}
                                        onClick={canPlay ? openPlayer : undefined}
                                        onKeyDown={
                                          canPlay
                                            ? (e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                  e.preventDefault();
                                                  openPlayer();
                                                }
                                              }
                                            : undefined
                                        }
                                        className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group ${
                                          canPlay ? "cursor-pointer" : ""
                                        }`}
                                      >
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-medium text-muted-foreground">
                                          {vIdx + 1}
                                        </div>
                                        <VideoIcon className={`size-4 shrink-0 ${isProcessing ? "text-amber-500" : "text-emerald-500"}`} />
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium truncate">
                                              {video.title}
                                            </span>
                                            {isProcessing && (
                                              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 text-[10px] px-1.5 py-0 h-5 border-transparent shrink-0">
                                                <Loader2Icon className="size-3 mr-1 animate-spin" />
                                                Processing
                                              </Badge>
                                            )}
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            {isProcessing
                                              ? "Video is being processed by Mux…"
                                              : `${formatDuration(video.durationMinutes)} · ${video.viewCount} view${video.viewCount !== 1 ? "s" : ""}`
                                            }
                                          </div>
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="size-7 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void handleDeleteVideo(video._id);
                                          }}
                                        >
                                          <Trash2Icon className="size-3.5" />
                                        </Button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Add video button inside each section */}
                              <div className="px-4 py-3 border-t border-border bg-muted/10">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                                  onClick={() => {
                                    setAddContentSectionId(section._id);
                                    setShowAddContent(true);
                                  }}
                                >
                                  <PlusIcon className="size-4 mr-1.5" />
                                  Add Video
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ════════ DETAILS TAB ════════ */}
            {activeTab === "details" && (
              <div className="rounded-xl border border-border bg-background p-6 shadow-sm space-y-8">
                <div>
                  <h2 className="text-xl font-bold">Course Settings</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Update your course metadata and pricing.
                  </p>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Title</Label>
                    <Input
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label>Description</Label>
                    <Textarea
                      rows={5}
                      value={form.description}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, description: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Input
                      value={form.subject}
                      onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Level</Label>
                    <Input
                      value={form.level}
                      onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Status</Label>
                    <select
                      value={form.status}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, status: e.target.value as typeof form.status }))
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      <option value="DRAFT">Draft</option>
                      <option value="ACTIVE">Active</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="ARCHIVED">Archived</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label>Pricing</Label>
                    <select
                      value={form.pricingModel}
                      onChange={(e) => {
                        const model = e.target.value as typeof form.pricingModel;
                        setForm((f) => ({
                          ...f,
                          pricingModel: model,
                          price: model === "PAID" ? f.price : null,
                        }));
                      }}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      <option value="FREE">Free</option>
                      <option value="SUBSCRIPTION_INCLUDED">Subscription</option>
                      <option value="PAID">Paid</option>
                    </select>
                  </div>

                  {form.pricingModel === "PAID" && (
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Price (NPR)</Label>
                      <Input
                        type="number"
                        value={form.price || ""}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, price: parseInt(e.target.value) || null }))
                        }
                      />
                      {form.price && form.price > 0 && (
                        <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1 mt-2">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Course price</span>
                            <span className="font-medium">NPR {form.price.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Platform commission ({commissionPercent}%)
                            </span>
                            <span className="text-red-500">
                              - NPR {Math.round(form.price * commissionPercent / 100).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between border-t border-border pt-1">
                            <span className="font-medium">You receive per sale</span>
                            <span className="font-bold text-emerald-600">
                              NPR {Math.round(form.price * (1 - commissionPercent / 100)).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-3 sm:col-span-2">
                    <div>
                      <Label>Free preview videos</Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Let students watch the first videos before enrolling.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: "No", enabled: false },
                          { label: "Yes", enabled: true },
                        ].map((option) => {
                          const disabled = form.pricingModel === "FREE";
                          const selected =
                            (form.freePreviewCount > 0) === option.enabled;

                          return (
                            <Button
                              key={option.label}
                              type="button"
                              variant={selected ? "default" : "outline"}
                              disabled={disabled}
                              className={
                                selected
                                  ? "bg-emerald-600 hover:bg-emerald-700"
                                  : ""
                              }
                              onClick={() =>
                                setForm((f) => ({
                                  ...f,
                                  freePreviewCount: option.enabled
                                    ? Math.max(1, f.freePreviewCount || 0)
                                    : 0,
                                }))
                              }
                            >
                              {option.label}
                            </Button>
                          );
                        })}
                      </div>

                      {form.pricingModel === "FREE" ? (
                        <div className="flex min-h-10 items-center rounded-md border border-border bg-muted/30 px-3 text-sm text-muted-foreground">
                          Free courses are already fully open.
                        </div>
                      ) : form.freePreviewCount > 0 ? (
                        <Input
                          type="number"
                          min={1}
                          value={form.freePreviewCount}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              freePreviewCount: Math.max(
                                0,
                                parseInt(e.target.value, 10) || 0,
                              ),
                            }))
                          }
                          placeholder="Number of first videos"
                        />
                      ) : (
                        <div className="flex min-h-10 items-center rounded-md border border-border bg-muted/30 px-3 text-sm text-muted-foreground">
                          No preview videos selected.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleSaveDetails}
                    disabled={isSaving}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isSaving ? (
                      <>
                        <Loader2Icon className="size-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* ════════ LIVE SESSIONS TAB ════════ */}
            {activeTab === "live" && course.liveSessionsEnabled && (
              <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
                <LiveSessionManager
                  courseId={course._id}
                  courseSlug={course.slug}
                  liveSessions={initialLiveSessions}
                  canAddLive={course.pricingModel !== "FREE"}
                  onSessionUpdate={() => router.refresh()}
                />
              </div>
            )}

            {/* ════════ ANALYTICS TAB ════════ */}
            {activeTab === "analytics" && (
              <div className="space-y-6">
                {/* Stats grid */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-border bg-background p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                          <Users2Icon className="size-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <div className="text-2xl font-bold">{analytics.enrollmentCount}</div>
                          <div className="text-xs text-muted-foreground">Total Students</div>
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200 dark:border-emerald-900/50 dark:hover:bg-emerald-950/50"
                        onClick={() => void openEnrolledUsersModal()}
                      >
                        See All
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
                        <BarChart3Icon className="size-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{analytics.avgProgressPercent}%</div>
                        <div className="text-xs text-muted-foreground">Avg Completion</div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
                        <VideoIcon className="size-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{totalVideos}</div>
                        <div className="text-xs text-muted-foreground">Total Videos</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Top videos */}
                {analytics.topVideos.length > 0 && (
                  <div className="rounded-xl border border-border bg-background p-6">
                    <h3 className="font-semibold mb-4">Most Watched Videos</h3>
                    <div className="space-y-3">
                      {analytics.topVideos.map((vid, idx) => (
                        <div key={vid._id} className="flex items-center gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted text-xs font-bold">
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{vid.title}</div>
                          </div>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
                            <EyeIcon className="size-3.5" />
                            {vid.viewCount}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "coupons" && (
              <div className="rounded-3xl border border-border bg-background p-8 shadow-sm">
                <CourseCouponsManager courseId={course._id} />
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Add Content Modal (3 methods: Upload, Zoom Link, Zoom Auto) */}
      <AddContentModal
        open={showAddContent}
        onOpenChange={setShowAddContent}
        courseId={course._id}
        sections={sections?.map((s) => ({ _id: s._id, title: s.title })) ?? []}
        defaultSectionId={addContentSectionId}
        onUploadSuccess={handleUploadSuccess}
      />

      <Dialog open={showEnrolledUsers} onOpenChange={setShowEnrolledUsers}>
        <DialogContent className="max-h-[85vh] w-[95vw] sm:max-w-3xl md:max-w-5xl lg:max-w-6xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-6 py-5">
            <DialogTitle>Enrolled Users</DialogTitle>
            <DialogDescription>
              Search and review every learner currently enrolled in this course.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 p-6">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={enrollmentSearch}
                onChange={(e) => setEnrollmentSearch(e.target.value)}
                placeholder="Search by name, email, or username"
                className="pl-9"
              />
            </div>

            {loadingEnrolledUsers ? (
              <div className="flex items-center justify-center py-12">
                <Loader2Icon className="size-5 animate-spin text-primary" />
              </div>
            ) : filteredEnrolledUsers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center">
                <Users2Icon className="mx-auto size-8 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {analytics.enrollmentCount === 0
                    ? "No students are enrolled yet."
                    : "No enrolled users match your search."}
                </p>
              </div>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-border">
                <div className="divide-y divide-border">
                  {filteredEnrolledUsers.map((enrollment) => (
                    <div
                      key={enrollment.id}
                      className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">
                            {enrollment.student.name}
                          </p>
                          <Badge variant="outline">{enrollment.accessType}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {enrollment.student.email}
                        </p>
                        {enrollment.student.username ? (
                          <p className="text-xs text-muted-foreground">
                            @{enrollment.student.username}
                          </p>
                        ) : null}
                      </div>

                      <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3 sm:text-right">
                        <div>
                          <p className="text-xs uppercase tracking-wider">Progress</p>
                          <p className="font-medium text-foreground">
                            {enrollment.overallProgressPercent}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wider">Videos</p>
                          <p className="font-medium text-foreground">
                            {enrollment.completedVideoCount}/{enrollment.totalVideoCount}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wider">Enrolled</p>
                          <p className="font-medium text-foreground">
                            {enrollment.enrolledAt
                              ? new Date(enrollment.enrolledAt).toLocaleDateString()
                              : "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Video player modal */}
      <Dialog
        open={Boolean(playingVideo)}
        onOpenChange={(open) => !open && setPlayingVideo(null)}
      >
        <DialogContent className="w-[95vw] sm:max-w-3xl md:max-w-4xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle className="truncate pr-6">
              {playingVideo?.title}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Video preview
            </DialogDescription>
          </DialogHeader>

          <div className="bg-black">
            {playingVideo?.muxPlaybackId ? (
              <MuxPlayer
                playbackId={playingVideo.muxPlaybackId}
                metadata={{ video_title: playingVideo.title }}
                autoPlay
                className="aspect-video w-full"
                style={{ width: "100%", aspectRatio: "16/9" }}
              />
            ) : playingVideo?.videoUrl ? (
              <video
                key={playingVideo.videoUrl}
                controls
                autoPlay
                preload="metadata"
                className="aspect-video w-full"
                src={playingVideo.videoUrl}
              />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center text-sm text-muted-foreground">
                Video is currently processing…
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
