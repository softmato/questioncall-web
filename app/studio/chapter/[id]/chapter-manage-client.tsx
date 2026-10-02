"use client";
import { formatDuration } from "@/lib/duration";


import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, FileTextIcon, GripVerticalIcon, Loader2Icon, PlusIcon, Trash2Icon, UploadIcon, VideoIcon } from "lucide-react";
import { toast } from "sonner";

import type { ChapterDetailData, ChapterPricingModel, ChapterStatus } from "@/lib/chapter-page-data";
import { uploadFileToR2 } from "@/lib/client-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Tab = "content" | "settings";
type AddMode = "VIDEO_LINK" | "VIDEO_FILE" | "DOC";

const STATUSES: ChapterStatus[] = ["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"];

export function ChapterManageClient({ chapter }: { chapter: ChapterDetailData }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("content");
  const [contents, setContents] = useState(chapter.contents);
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("VIDEO_LINK");
  const [contentTitle, setContentTitle] = useState("");
  const [contentDescription, setContentDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    title: chapter.title,
    description: chapter.description,
    subject: chapter.subject,
    level: chapter.level,
    status: chapter.status,
    pricingModel: chapter.pricingModel,
    price: chapter.price,
    freePreviewCount: chapter.freePreviewCount,
  });

  const resetAdd = () => {
    setContentTitle("");
    setContentDescription("");
    setVideoUrl("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const refreshContents = async () => {
    const response = await fetch(`/api/chapters/${chapter._id}/contents`);
    if (!response.ok) return;
    const data = await response.json();
    setContents(data.contents ?? []);
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/chapters/${chapter._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          freePreviewCount:
            form.pricingModel === "FREE" ? 0 : form.freePreviewCount,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save chapter.");
      }
      toast.success("Chapter saved.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save.");
    } finally {
      setIsSaving(false);
    }
  };

  const addContent = async () => {
    if (!contentTitle.trim()) {
      toast.error("Enter a title.");
      return;
    }
    setIsAdding(true);
    try {
      if (addMode === "DOC") {
        if (!selectedFile) throw new Error("Choose a document.");
        const uploaded = await uploadFileToR2(selectedFile, { folder: "chapter-docs" });
        const response = await fetch(`/api/chapters/${chapter._id}/contents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "DOC",
            title: contentTitle.trim(),
            description: contentDescription.trim() || null,
            fileUrl: uploaded.url,
            fileKey: uploaded.key,
            fileName: selectedFile.name,
            fileType: selectedFile.type || "application/octet-stream",
            fileSizeBytes: selectedFile.size,
          }),
        });
        if (!response.ok) throw new Error("Failed to add document.");
      } else if (addMode === "VIDEO_LINK") {
        if (!videoUrl.trim()) throw new Error("Enter a video URL.");
        const response = await fetch(`/api/chapters/${chapter._id}/contents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "VIDEO",
            title: contentTitle.trim(),
            description: contentDescription.trim() || null,
            videoUrl: videoUrl.trim(),
          }),
        });
        if (!response.ok) throw new Error("Failed to add video.");
      } else {
        if (!selectedFile) throw new Error("Choose a video file.");
        const createResponse = await fetch(`/api/chapters/${chapter._id}/contents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "VIDEO",
            title: contentTitle.trim(),
            description: contentDescription.trim() || null,
          }),
        });
        if (!createResponse.ok) throw new Error("Failed to create video upload.");
        const { uploadUrl } = await createResponse.json();
        const uploadResponse = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": selectedFile.type || "video/mp4" },
          body: selectedFile,
        });
        if (!uploadResponse.ok) throw new Error("Video upload failed.");
        toast.success("Video uploaded. Processing will finish shortly.");
      }

      toast.success("Content added.");
      resetAdd();
      setShowAdd(false);
      await refreshContents();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add content.");
    } finally {
      setIsAdding(false);
    }
  };

  const deleteContent = async (contentId: string) => {
    if (!confirm("Delete this content item?")) return;
    try {
      const response = await fetch(`/api/chapters/${chapter._id}/contents/${contentId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete content.");
      setContents((prev) => prev.filter((content) => content._id !== contentId));
      toast.success("Content deleted.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete.");
    }
  };

  const moveContent = async (contentId: string, order: number) => {
    try {
      const response = await fetch(`/api/chapters/${chapter._id}/contents/${contentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      if (!response.ok) throw new Error("Failed to reorder.");
      await refreshContents();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reorder.");
    }
  };

  return (
    <div className="min-h-svh bg-[#f6f8fb] dark:bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/studio">
              <ArrowLeftIcon className="size-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{chapter.title}</div>
            <div className="text-xs text-muted-foreground">Chapter Studio</div>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/chapters/${chapter.slug}`}>Preview</Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-1">
          {[
            { id: "content" as const, label: "Content" },
            { id: "settings" as const, label: "Settings" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full rounded-lg px-3 py-2.5 text-left text-sm ${
                activeTab === tab.id
                  ? "bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                  : "text-muted-foreground hover:bg-muted/60"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </aside>

        <main className="min-w-0">
          {activeTab === "content" ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold">Content</h1>
                  <p className="text-sm text-muted-foreground">
                    Flat list of chapter videos and documents.
                  </p>
                </div>
                <Button onClick={() => setShowAdd(true)} className="bg-emerald-600 hover:bg-emerald-700">
                  <PlusIcon className="mr-2 size-4" />
                  Add Content
                </Button>
              </div>

              <div className="space-y-3">
                {contents.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-background p-12 text-center text-sm text-muted-foreground">
                    No content yet.
                  </div>
                ) : (
                  contents.map((content, index) => (
                    <div key={content._id} className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
                      <GripVerticalIcon className="size-4 text-muted-foreground/50" />
                      {content.type === "VIDEO" ? (
                        <VideoIcon className="size-5 text-emerald-600" />
                      ) : (
                        <FileTextIcon className="size-5 text-blue-600" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {content.order}. {content.title}
                          </span>
                          {content.status !== "READY" ? (
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                              {content.status}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {content.type === "VIDEO"
                            ? `${formatDuration(content.durationMinutes)} · ${content.viewCount} views`
                            : content.fileName || content.fileType || "Document"}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => void moveContent(content._id, content.order - 1)}>
                        Up
                      </Button>
                      <Button variant="ghost" size="sm" disabled={index === contents.length - 1} onClick={() => void moveContent(content._id, content.order + 1)}>
                        Down
                      </Button>
                      <Button variant="ghost" size="icon" className="text-red-500" onClick={() => void deleteContent(content._id)}>
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Title</Label>
                  <Input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Description</Label>
                  <Textarea rows={5} value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input value={form.subject} onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Level</Label>
                  <Input value={form.level} onChange={(event) => setForm((prev) => ({ ...prev, level: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as ChapterStatus }))} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Pricing</Label>
                  <select value={form.pricingModel} onChange={(event) => setForm((prev) => ({ ...prev, pricingModel: event.target.value as ChapterPricingModel, price: event.target.value === "PAID" ? prev.price : null }))} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="FREE">Free</option>
                    <option value="SUBSCRIPTION_INCLUDED">Subscription</option>
                    <option value="PAID">Paid</option>
                  </select>
                </div>
                {form.pricingModel === "PAID" ? (
                  <div className="space-y-2">
                    <Label>Price (NPR)</Label>
                    <Input type="number" value={form.price ?? ""} onChange={(event) => setForm((prev) => ({ ...prev, price: parseInt(event.target.value, 10) || null }))} />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label>Free preview items</Label>
                  <Input type="number" min={0} disabled={form.pricingModel === "FREE"} value={form.freePreviewCount} onChange={(event) => setForm((prev) => ({ ...prev, freePreviewCount: parseInt(event.target.value, 10) || 0 }))} />
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={saveSettings} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700">
                  {isSaving ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : null}
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>

      {showAdd ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-background p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold">Add content</h2>
              <Button variant="ghost" onClick={() => setShowAdd(false)}>Close</Button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "VIDEO_LINK" as const, label: "Video Link" },
                  { id: "VIDEO_FILE" as const, label: "Upload Video" },
                  { id: "DOC" as const, label: "Document" },
                ].map((mode) => (
                  <Button key={mode.id} type="button" variant={addMode === mode.id ? "default" : "outline"} onClick={() => setAddMode(mode.id)}>
                    {mode.label}
                  </Button>
                ))}
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={contentTitle} onChange={(event) => setContentTitle(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={contentDescription} onChange={(event) => setContentDescription(event.target.value)} />
              </div>
              {addMode === "VIDEO_LINK" ? (
                <div className="space-y-2">
                  <Label>Video URL</Label>
                  <Input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>{addMode === "DOC" ? "Document" : "Video file"}</Label>
                  <Input ref={fileInputRef} type="file" accept={addMode === "VIDEO_FILE" ? "video/*" : undefined} onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} />
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button onClick={addContent} disabled={isAdding} className="bg-emerald-600 hover:bg-emerald-700">
                  {isAdding ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : <UploadIcon className="mr-2 size-4" />}
                  Add
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
