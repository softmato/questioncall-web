"use client";

import { Share2Icon, GlobeIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  getSocialHandleMeta,
  getSocialLinkHref,
  type PlatformSocialLink,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

function BrandIcon({ platform, className }: { platform: string; className?: string }) {
  switch (platform) {
    case "facebook":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
        </svg>
      );
    case "instagram":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
        </svg>
      );
    case "whatsapp":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
        </svg>
      );
    case "youtube":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33 2.78 2.78 0 0 0 1.94 2c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.33 29 29 0 0 0-.46-5.33z"/>
          <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/>
        </svg>
      );
    case "twitter":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M4 4l11.733 16h4.267l-11.733 -16z"/>
          <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772"/>
        </svg>
      );
    case "linkedin":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
          <rect x="2" y="9" width="4" height="12"/>
          <circle cx="4" cy="4" r="2"/>
        </svg>
      );
    case "telegram":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="m22 2-7 20-4-9-9-4Z" />
          <path d="M22 2 11 13" />
        </svg>
      );
    case "tiktok":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5v3a8 8 0 0 1-5-3v5.5a4.5 4.5 0 1 1-4.5-4.5h.5v3h-.5a1.5 1.5 0 1 0 1.5 1.5z"/>
        </svg>
      );
    case "discord":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M9 12h.01M15 12h.01M7.5 16h9M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16l-3.5-3.5L14 18l-2 1-2-1-2.5-1.5z"/>
        </svg>
      );
    case "website":
      return <GlobeIcon className={className} />;
    default:
      return null;
  }
}

export function SocialHandlesHover({
  links,
}: {
  links: PlatformSocialLink[];
}) {
  const activeLinks = links.filter((item) => item.url.trim().length > 0);

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Button
          aria-label="Show social handles"
          className="border-primary/30 bg-primary/5 text-primary hover:bg-primary/12 hover:text-primary"
          size="icon-sm"
          variant="outline"
        >
          <Share2Icon className="size-4" />
        </Button>
      </HoverCardTrigger>

      <HoverCardContent
        align="end"
        className="w-[calc(100vw-1.5rem)] max-w-[22rem] overflow-hidden rounded-2xl border border-border/80 bg-background/95 p-0 shadow-2xl backdrop-blur-xl"
        side="bottom"
      >
        <div className="border-b border-border/70 bg-muted/25 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Social
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            QuestionCall handles
          </p>
        </div>

        {activeLinks.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            No social links have been added yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
            {activeLinks.map((item) => {
              const meta = getSocialHandleMeta(item.platform);
              if (!meta) {
                return null;
              }

              const href = getSocialLinkHref(item.platform, item.url);

              return (
                <a
                  key={item.platform}
                  href={href ?? undefined}
                  target={href ? "_blank" : undefined}
                  rel={href ? "noreferrer" : undefined}
                  className="group min-w-0 rounded-2xl border border-border/70 bg-background px-3 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/[0.06]"
                >
                  <div className="flex flex-col items-center gap-2 text-center">
                    <span
                      className={cn(
                        "inline-flex size-9 items-center justify-center rounded-full text-[11px] font-semibold shadow-sm transition-transform duration-200 group-hover:scale-105",
                        meta.badgeClassName,
                      )}
                    >
                      {meta.badge}
                    </span>
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-semibold text-foreground">{meta.label}</p>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

export function SocialHandlesDirect({
  links,
}: {
  links: PlatformSocialLink[];
}) {
  const activeLinks = links.filter((item) => item.url.trim().length > 0);

  if (activeLinks.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {activeLinks.map((item) => {
        const meta = getSocialHandleMeta(item.platform);
        if (!meta) {
          return null;
        }

        const href = getSocialLinkHref(item.platform, item.url);
        const Icon = BrandIcon({ platform: item.platform, className: "size-[15px]" });

        return (
          <a
            key={item.platform}
            href={href ?? undefined}
            target={href ? "_blank" : undefined}
            rel={href ? "noreferrer" : undefined}
            aria-label={meta.label}
            title={meta.label}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-full text-xs font-semibold shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md",
              meta.badgeClassName,
            )}
          >
            {Icon ?? meta.badge}
          </a>
        );
      })}
    </div>
  );
}
