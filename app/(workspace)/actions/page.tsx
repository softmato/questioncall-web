import Link from "next/link";
import {
  BookOpenIcon,
  ChevronRightIcon,
  GraduationCapIcon,
  ListIcon,
  TrophyIcon,
  XIcon,
} from "lucide-react";

import { createNoIndexMetadata } from "@/lib/seo";

export const metadata = createNoIndexMetadata({
  title: "Actions",
  description: "Quick teacher actions inside QuestionCall.",
});

const actions = [
  {
    href: "/",
    icon: ListIcon,
    title: "View Question Feed",
    subtitle: "See all open questions",
  },
  {
    href: "/studio",
    icon: BookOpenIcon,
    title: "Course Studio",
    subtitle: "Manage your courses",
  },
  {
    href: "/leaderboard",
    icon: TrophyIcon,
    title: "Leaderboard",
    subtitle: "See top rated teachers",
  },
] as const;

export default function ActionsPage() {
  return (
    <main className="pwa-pushed-screen min-h-full bg-background px-6 pb-8 pt-5">
      <div className="pwa-pushed-header -mx-6 -mt-5 mb-5 sticky top-0 z-30 items-center justify-between border-b border-border bg-background px-5 pb-3 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
        <Link
          href="/"
          className="mr-3 flex size-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95"
          aria-label="Close"
        >
          <XIcon className="size-6" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-bold tracking-tight text-foreground">
            Actions
          </h1>
          <p className="mt-0.5 truncate text-[12px] font-medium text-primary">
            Quick teacher actions
          </p>
        </div>
      </div>

      <div className="mb-8">
        <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <GraduationCapIcon className="size-6" />
        </div>
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">
          Actions
        </h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Quick teacher actions
        </p>
      </div>

      <div className="space-y-3">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="flex items-center rounded-2xl border border-border bg-card p-4 transition hover:bg-muted/40 active:bg-muted/60"
          >
            <span className="mr-4 flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <action.icon className="size-[22px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-card-foreground">
                {action.title}
              </span>
              <span className="block text-sm text-muted-foreground">
                {action.subtitle}
              </span>
            </span>
            <ChevronRightIcon className="size-[18px] shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </main>
  );
}
