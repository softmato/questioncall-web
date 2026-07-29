"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import {
  BookOpenIcon,
  GraduationCapIcon,
  LayersIcon,
  UserCircle2Icon,
} from "lucide-react";

import { LogoMark } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

type CourseHeaderProps = {
  user?: {
    name?: string | null;
    role?: string;
  } | null;
};

export function CourseHeader({ user }: CourseHeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        scrolled
          ? "border-b border-emerald-600/20 bg-background/85 shadow-sm backdrop-blur-xl"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left — Logo */}
        <Link href="/" className="flex items-center gap-3">
          <LogoMark size={34} className="rounded-xl" />
          <span className="text-[17px] font-bold tracking-tight text-foreground">
            {APP_NAME}
          </span>
        </Link>

        {/* Center — Nav links (hidden on mobile) */}
        <nav className="hidden items-center gap-1 md:flex">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <Link href="/">Home</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="text-emerald-600 dark:text-emerald-400 font-semibold">
            <Link href="/courses">
              <BookOpenIcon className="mr-1 size-4" />
              Courses
            </Link>
          </Button>
          {/* Public sections — crawlable from every page so search engines can
              discover chapters, quizzes and pricing, not just the sign-up pages. */}
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <Link href="/chapters">
              <LayersIcon className="mr-1 size-4" />
              Chapters
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <Link href="/quiz">Quiz</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <Link href="/pricing">Pricing</Link>
          </Button>
          {user && (
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <Link href="/courses/my">
                <GraduationCapIcon className="mr-1 size-4" />
                My Courses
              </Link>
            </Button>
          )}
        </nav>

        {/* Right — Actions */}
        <div className="flex items-center gap-2">
          <ThemeToggle />

          {user ? (
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 sm:flex pr-2 border-r border-border">
                <UserCircle2Icon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{user.name || "User"}</span>
                {user.role && (
                  <span className="inline-flex items-center rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-900/40 dark:text-emerald-400">
                    {user.role}
                  </span>
                )}
              </div>
              <Button asChild variant="outline" size="sm" className="border-emerald-600/30 text-emerald-700 dark:text-emerald-400">
                <Link href="/">
                  Back to Dashboard
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/auth/signin">Sign in</Link>
              </Button>
              <Button
                asChild
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/25"
              >
                <Link href="/auth/signup/student">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="border-t border-border/60 md:hidden">
        <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6">
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Button asChild size="sm" variant="ghost" className="shrink-0">
              <Link href="/">Home</Link>
            </Button>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="shrink-0 border-emerald-600/30 text-emerald-700 dark:text-emerald-400"
            >
              <Link href="/courses">
                <BookOpenIcon className="mr-1 size-4" />
                Courses
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost" className="shrink-0">
              <Link href="/chapters">
                <LayersIcon className="mr-1 size-4" />
                Chapters
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost" className="shrink-0">
              <Link href="/quiz">Quiz</Link>
            </Button>
            <Button asChild size="sm" variant="ghost" className="shrink-0">
              <Link href="/pricing">Pricing</Link>
            </Button>
            {user ? (
              <>
                <Button asChild size="sm" variant="ghost" className="shrink-0">
                  <Link href="/courses/my">
                    <GraduationCapIcon className="mr-1 size-4" />
                    My Courses
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <Link href="/">Dashboard</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild size="sm" variant="ghost" className="shrink-0">
                  <Link href="/auth/signin">Sign in</Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  className="shrink-0 bg-emerald-600 text-white shadow-md shadow-emerald-600/25 hover:bg-emerald-700"
                >
                  <Link href="/auth/signup/student">Get started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
