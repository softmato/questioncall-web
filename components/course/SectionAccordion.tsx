"use client";
import { formatDuration } from "@/lib/duration";


import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2Icon, ChevronDownIcon, LockIcon, PlayCircleIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type SectionVideo = {
  _id: string;
  title: string;
  durationMinutes: number;
  order: number;
};

type SectionItem = {
  _id: string;
  title: string;
  description?: string | null;
  order: number;
  videos: SectionVideo[];
};

type SectionAccordionProps = {
  sections: SectionItem[];
  currentVideoId?: string | null;
  completedVideoIds?: string[];
  courseSlug?: string;
  allowLinks?: boolean;
  previewVideoIds?: string[];
};

export function SectionAccordion({
  sections,
  currentVideoId,
  completedVideoIds = [],
  courseSlug,
  allowLinks = false,
  previewVideoIds = [],
}: SectionAccordionProps) {
  const completedSet = useMemo(
    () => new Set(completedVideoIds),
    [completedVideoIds],
  );
  const previewSet = useMemo(() => new Set(previewVideoIds), [previewVideoIds]);
  const [openSectionId, setOpenSectionId] = useState<string | null>(
    sections[0]?._id ?? null,
  );

  if (sections.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-background/70 p-6 text-sm text-muted-foreground">
        No sections yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((section) => {
        const isOpen = openSectionId === section._id;

        return (
          <div
            key={section._id}
            className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm"
          >
            <button
              type="button"
              onClick={() => setOpenSectionId(isOpen ? null : section._id)}
              className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
            >
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {section.order}. {section.title}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {section.videos.length} videos
                </div>
              </div>
              <ChevronDownIcon
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  isOpen ? "rotate-180" : "",
                )}
              />
            </button>

            {isOpen ? (
              <div className="border-t border-border bg-muted/20">
                {section.description ? (
                  <p className="px-4 pt-3 text-xs text-muted-foreground">
                    {section.description}
                  </p>
                ) : null}
                <div className="p-3">
                  {section.videos.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
                      No videos in this section yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {section.videos.map((video) => {
                        const isActive = currentVideoId === video._id;
                        const isCompleted = completedSet.has(video._id);
                        const isPreview = previewSet.has(video._id);
                        const canOpen = allowLinks || isPreview;
                        const href = courseSlug
                          ? `/courses/${courseSlug}/watch/${video._id}`
                          : "#";

                        const content = (
                          <>
                            <div className="flex items-center gap-3">
                              {isCompleted ? (
                                <CheckCircle2Icon className="size-4 text-emerald-500" />
                              ) : canOpen ? (
                                <PlayCircleIcon className="size-4 text-primary" />
                              ) : (
                                <LockIcon className="size-4 text-muted-foreground" />
                              )}
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-foreground">
                                  {video.order}. {video.title}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span>{formatDuration(video.durationMinutes)}</span>
                                  {isPreview ? (
                                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300">
                                      Free preview
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </>
                        );

                        return canOpen ? (
                          <Link
                            key={video._id}
                            href={href}
                            className={cn(
                              "flex items-center justify-between rounded-xl border px-3 py-3 transition-colors",
                              isActive
                                ? "border-primary bg-primary/5"
                                : "border-border bg-background hover:bg-muted/60",
                            )}
                          >
                            {content}
                          </Link>
                        ) : (
                          <div
                            key={video._id}
                            className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-3"
                          >
                            {content}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
