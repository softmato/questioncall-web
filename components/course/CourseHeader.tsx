"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

// "/courses" also prefixes "/courses/my", which has its own link.
function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/courses" && pathname.startsWith("/courses/my")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function CourseHeader({ user }: CourseHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname() ?? "";
  const links = [
    { href: "/", label: "Home" },
    { href: "/courses", label: "Courses", icon: BookOpenIcon },
    { href: "/chapters", label: "Chapters", icon: LayersIcon },
    { href: "/quiz", label: "Quiz" },
    { href: "/pricing", label: "Pricing" },
    ...(user ? [{ href: "/courses/my", label: "My Courses", icon: GraduationCapIcon }] : []),
  ];

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
          {links.map(({ href, label, icon: Icon }) => {
            const active = isActivePath(pathname, href);
            return (
              <Button
                key={href}
                asChild
                variant="ghost"
                size="sm"
                className={
                  active
                    ? "font-semibold text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground hover:text-foreground"
                }
              >
                <Link href={href} aria-current={active ? "page" : undefined}>
                  {Icon ? <Icon className="mr-1 size-4" /> : null}
                  {label}
                </Link>
              </Button>
            );
          })}
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
            {links.map(({ href, label, icon: Icon }) => {
              const active = isActivePath(pathname, href);
              return (
                <Button
                  key={href}
                  asChild
                  size="sm"
                  variant={active ? "outline" : "ghost"}
                  className={
                    active
                      ? "shrink-0 border-emerald-600/30 text-emerald-700 dark:text-emerald-400"
                      : "shrink-0"
                  }
                >
                  <Link href={href} aria-current={active ? "page" : undefined}>
                    {Icon ? <Icon className="mr-1 size-4" /> : null}
                    {label}
                  </Link>
                </Button>
              );
            })}
            {user ? (
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link href="/">Dashboard</Link>
              </Button>
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
