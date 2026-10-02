import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

type LogoProps = {
  compact?: boolean;
  href?: string;
  prefetch?: boolean;
  showTagline?: boolean;
  tagline?: string;
};

type LogoMarkProps = {
  size?: number;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
};

export function LogoMark({
  size = 36,
  className,
  imageClassName,
  priority = false,
}: LogoMarkProps) {
  return (
    <span
      className={cn("relative inline-flex shrink-0 overflow-hidden", className)}
      style={{ width: size, height: size }}
    >
      <Image
        src="/logo.png"
        alt="QuestionCall logo"
        fill
        priority={priority}
        sizes={`${size}px`}
        className={cn("object-contain", imageClassName)}
      />
    </span>
  );
}

export function Logo({
  compact = false,
  href = "/",
  prefetch,
  showTagline = true,
  tagline,
}: LogoProps) {
  return (
    <Link href={href} prefetch={prefetch} className="inline-flex items-center gap-1.5">
      <LogoMark size={36} className="rounded-2xl" />
      {!compact ? (
        <span className="flex flex-col">
          <span className="headline text-lg font-semibold text-foreground">{APP_NAME}</span>
          {showTagline ? (
            <span className="eyebrow text-[11px] text-muted-foreground">{tagline || "Students • Teachers • Admin"}</span>
          ) : null}
        </span>
      ) : null}
    </Link>
  );
}
