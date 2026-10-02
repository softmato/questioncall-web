"use client";
import { formatDuration } from "@/lib/duration";


import Link from "next/link";
import { FileTextIcon, LockIcon, PlayCircleIcon } from "lucide-react";

import type { ChapterContentData } from "@/lib/chapter-page-data";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ChapterContentList({
  slug,
  contents,
  hasAccess,
  previewCount,
  currentContentId = null,
}: {
  slug: string;
  contents: ChapterContentData[];
  hasAccess: boolean;
  previewCount: number;
  currentContentId?: string | null;
}) {
  const previewIds = new Set(contents.slice(0, previewCount).map((content) => content._id));

  if (contents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        No content has been added yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {contents.map((content) => {
        const isPreview = previewIds.has(content._id);
        const canOpen = hasAccess || isPreview;
        const isActive = currentContentId === content._id;

        const body = (
          <div
            className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3",
              isActive ? "border-primary bg-primary/5" : "border-border bg-background",
              canOpen ? "hover:bg-muted/60" : "opacity-60",
            )}
          >
            {canOpen ? (
              content.type === "VIDEO" ? (
                <PlayCircleIcon className="size-5 text-emerald-600" />
              ) : (
                <FileTextIcon className="size-5 text-blue-600" />
              )
            ) : (
              <LockIcon className="size-5 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <div className="line-clamp-1 text-sm font-medium text-foreground">
                {content.order}. {content.title}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {content.type === "VIDEO"
                    ? content.status === "READY"
                      ? `${formatDuration(content.durationMinutes)}`
                      : content.status
                    : content.fileName || content.fileType || "Document"}
                </span>
                {isPreview && !hasAccess ? (
                  <Badge className="h-5 bg-emerald-100 px-2 py-0 text-[10px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    Free preview
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
        );

        return canOpen && content.status === "READY" ? (
          <Link key={content._id} href={`/chapters/${slug}/watch/${content._id}`}>
            {body}
          </Link>
        ) : (
          <div key={content._id}>{body}</div>
        );
      })}
    </div>
  );
}
