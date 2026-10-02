"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { BookOpenIcon, SearchIcon, SlidersHorizontalIcon, PlusIcon, Loader2Icon, MessageCircleIcon, BookIcon, UserIcon, MenuIcon } from "lucide-react";

import { PostQuestionModal } from "@/components/shared/post-question-modal";
import { SocialHandlesHover } from "@/components/shared/social-handles-hover";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { LogoMark } from "@/components/shared/logo";
import { useWorkspaceFilters, type WorkspaceFilterState } from "@/components/shared/workspace-filter-context";
import { NotificationBell } from "@/components/shared/notification-bell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { PlatformSocialLinks } from "@/models/PlatformConfig";

type SearchResult = {
  questions: { id: string; title: string; body: string; subject?: string; level?: string }[];
  courses: { id: string; title: string; slug: string; subject?: string; thumbnailUrl?: string; pricingModel: string }[];
  users: { id: string; name: string; username: string; userImage?: string; role: string }[];
};

type FilterOptions = {
  subjects: string[];
  streams: string[];
  levels: string[];
};

type FilterState = {
  subjects: string[];
  streams: string[];
  levels: string[];
};

type AuthenticatedHeaderProps = {
  isScrolled: boolean;
  primaryHref: string;
  primaryLabel: string;
  showQuizLink?: boolean;
  showQuestionFilter?: boolean;
  useModalForPrimary?: boolean;
  userId?: string;
  socialLinks: PlatformSocialLinks;
};

export function AuthenticatedHeader({
  isScrolled,
  primaryHref,
  primaryLabel,
  showQuizLink = false,
  showQuestionFilter = false,
  useModalForPrimary = false,
  userId,
  socialLinks,
}: AuthenticatedHeaderProps) {
  const router = useRouter();
  const {
    filters: currentFilters,
    activeFilterCount,
    updateFilters,
    clearFilters: clearWorkspaceFilters,
    isSyncing: isSyncingFilters,
  } = useWorkspaceFilters();
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isFilterOpen) {
      setDraftFilters(currentFilters);
    }
  }, [currentFilters, isFilterOpen]);

  useEffect(() => {
    if (isFilterOpen && !filterOptions && !isLoadingFilters) {
      setIsLoadingFilters(true);
      fetch('/api/filters/options')
        .then((res) => res.json())
        .then((data) => {
          setFilterOptions({
            subjects: data.subjects || [],
            streams: data.streams || [],
            levels: data.levels || [],
          });
        })
        .catch(console.error)
        .finally(() => setIsLoadingFilters(false));
    }
  }, [isFilterOpen, filterOptions, isLoadingFilters]);

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.trim().length < 2) {
      setSearchResults(null);
      setShowDropdown(false);
      return;
    }

    setShowDropdown(true);
    setIsSearching(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(value.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchValue.trim()) {
      setShowDropdown(false);
      router.push(`/search/results?q=${encodeURIComponent(searchValue.trim())}`);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const [draftFilters, setDraftFilters] = useState<FilterState>(currentFilters);

  const toggleFilter = (group: keyof FilterState, value: string) => {
    setDraftFilters((currentState) => {
      const currentValues = currentState[group];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value];

      return {
        ...currentState,
        [group]: nextValues,
      };
    });
  };

  const applyFilters = () => {
    updateFilters(draftFilters as WorkspaceFilterState);
    setIsFilterOpen(false);
  };

  const clearFilters = () => {
    clearWorkspaceFilters();
    setDraftFilters({
      subjects: [],
      streams: [],
      levels: [],
    });
    setIsFilterOpen(false);
  };

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-30 transition-all duration-200",
          isScrolled
            ? "border-b border-border/70 bg-background/80 backdrop-blur-md shadow-sm"
            : "border-transparent bg-background"
        )}
      >
        <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
          {/* Desktop: normal sidebar trigger on left */}
          <SidebarTrigger className="shrink-0 hidden md:inline-flex" />
          {/* Mobile: app logo on left instead of sidebar trigger */}
          <Link href="/" className="flex items-center gap-2 md:hidden shrink-0">
            <LogoMark size={28} className="rounded-lg" />
          </Link>
          <div className="relative hidden md:flex flex-1 max-w-xl mx-auto" ref={searchRef}>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 sm:left-3 size-4 sm:size-[18px] -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 sm:h-10 pl-8 sm:pl-10 text-xs sm:text-sm bg-muted/40 md:bg-background"
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => { if (searchValue.trim().length >= 2) setShowDropdown(true); }}
              placeholder="Search questions, courses, and users"
              value={searchValue}
            />
            {isSearching && (
              <Loader2Icon className="pointer-events-none absolute top-1/2 right-3 size-[18px] -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
            {showDropdown && searchResults && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-background shadow-lg">
                {searchResults.questions.length === 0 && searchResults.courses.length === 0 && searchResults.users.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">No results found</div>
                ) : (
                  <>
                    {searchResults.questions.length > 0 && (
                      <div className="border-b border-border">
                        <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
                          <MessageCircleIcon className="size-3" />
                          Questions
                        </div>
                        {searchResults.questions.map((q) => (
                          <Link
                            key={q.id}
                            href={`/question/${q.id}`}
                            onClick={() => setShowDropdown(false)}
                            className="flex flex-col gap-0.5 px-3 py-2 hover:bg-muted"
                          >
                            <span className="line-clamp-1 text-sm font-medium">{q.title}</span>
                            <span className="line-clamp-1 text-xs text-muted-foreground">{q.body}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                    {searchResults.courses.length > 0 && (
                      <div className="border-b border-border">
                        <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
                          <BookIcon className="size-3" />
                          Courses
                        </div>
                        {searchResults.courses.map((c) => (
                          <Link
                            key={c.id}
                            href={`/courses/${c.slug}`}
                            onClick={() => setShowDropdown(false)}
                            className="flex items-center gap-3 px-3 py-2 hover:bg-muted"
                          >
                            {c.thumbnailUrl ? (
                              <img src={c.thumbnailUrl} alt="" className="size-8 rounded object-cover" />
                            ) : (
                              <div className="size-8 rounded bg-muted flex items-center justify-center">
                                <BookIcon className="size-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex flex-col gap-0.5">
                              <span className="line-clamp-1 text-sm font-medium">{c.title}</span>
                              <span className="text-xs text-muted-foreground">{c.subject} • {c.pricingModel}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                    {searchResults.users.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
                          <UserIcon className="size-3" />
                          Users
                        </div>
                        {searchResults.users.map((u) => (
                          <Link
                            key={u.id}
                            href={`/${u.username}`}
                            onClick={() => setShowDropdown(false)}
                            className="flex items-center gap-3 px-3 py-2 hover:bg-muted"
                          >
                            {u.userImage ? (
                              <img src={u.userImage} alt="" className="size-8 rounded-full object-cover" />
                            ) : (
                              <div className="size-8 rounded-full bg-muted flex items-center justify-center">
                                <UserIcon className="size-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex flex-col gap-0.5">
                              <span className="line-clamp-1 text-sm font-medium">{u.name}</span>
                              <span className="text-xs text-muted-foreground">@{u.username} • {u.role.toLowerCase()}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <Link
                  href={`/search/results?q=${encodeURIComponent(searchValue)}`}
                  onClick={() => setShowDropdown(false)}
                  className="block border-t border-border px-3 py-2 text-center text-sm font-medium text-primary hover:bg-muted"
                >
                  View all results
                </Link>
              </div>
            )}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2.5">
            {showQuizLink ? (
              <Button asChild variant="outline" size="icon-sm" className="hidden md:inline-flex md:size-auto md:px-3 md:py-1.5">
                <Link href="/quiz">
                  <BookOpenIcon className="size-4 md:mr-1" />
                  <span className="hidden md:inline">Play Quiz</span>
                </Link>
              </Button>
            ) : null}

            {showQuestionFilter ? (
              <Button
                size="icon-sm"
                className="size-9 sm:size-auto sm:px-3 sm:py-1.5"
                onClick={() => { setDraftFilters(currentFilters); setIsFilterOpen(true); }}
                variant="outline"
              >
                <SlidersHorizontalIcon className="size-[18px] sm:size-4 sm:mr-1" />
                <span className="hidden sm:inline">
                  Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                </span>
                {activeFilterCount > 0 ? (
                  <span className="flex sm:hidden absolute top-0 right-0 -translate-y-[2px] translate-x-[2px] size-3.5 items-center justify-center rounded-full border border-background bg-primary text-[8px] font-bold text-primary-foreground">{activeFilterCount}</span>
                ) : null}
              </Button>
            ) : null}

            {useModalForPrimary ? (
              <Button
                size="icon-sm"
                className="size-9 sm:size-auto sm:px-3 sm:py-1.5"
                onClick={() => setIsPostModalOpen(true)}
                aria-label={primaryLabel}
              >
                <PlusIcon className="size-[18px] sm:size-4 sm:mr-1" />
                <span className="hidden sm:inline">{primaryLabel}</span>
              </Button>
            ) : (
              <Button asChild size="icon-sm" className="size-9 sm:size-auto sm:px-3 sm:py-1.5" variant={primaryLabel === "Open messages" ? "outline" : "default"}>
                <Link href={primaryHref} aria-label={primaryLabel}>
                  <PlusIcon className="size-[18px] sm:hidden" />
                  <span className="hidden sm:inline">{primaryLabel}</span>
                </Link>
              </Button>
            )}
            
            {userId && <NotificationBell userId={userId} />}

            <div className="hidden md:flex items-center gap-2.5">
              <Button asChild variant="outline" size="icon-sm" className="sm:size-auto sm:px-3 sm:py-1.5 border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary">
                <Link href="/courses">
                  <BookOpenIcon className="size-4 sm:mr-1" />
                  <span className="hidden sm:inline">Courses</span>
                </Link>
              </Button>
              <SocialHandlesHover links={socialLinks} />
              <ThemeToggle />
            </div>
            {/* Mobile: sidebar toggle on right side with larger size */}
            <button
              type="button"
              onClick={() => {
                const trigger = document.querySelector('[data-sidebar="trigger"]') as HTMLButtonElement | null;
                trigger?.click();
              }}
              className="inline-flex md:hidden items-center justify-center size-9 rounded-xl border border-border bg-background text-foreground shadow-sm transition-colors hover:bg-muted active:scale-95 ml-0.5"
              aria-label="Open menu"
            >
              <MenuIcon className="size-[18px]" />
            </button>
          </div>
        </div>
      </header>

      {/* Post Question Modal — only rendered when useModalForPrimary is true */}
      {useModalForPrimary && (
        <PostQuestionModal open={isPostModalOpen} onOpenChange={setIsPostModalOpen} />
      )}

      <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
        <SheetContent className="w-full sm:max-w-lg" side="right">
          <SheetHeader>
            <SheetTitle>Question filters</SheetTitle>
            <SheetDescription>
              Set filters for top questions now, and later we can connect the same choices to real ranking and feed results.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6">
            <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
              Active filters:
              <div className="mt-3 flex flex-wrap gap-2">
                {activeFilterCount > 0 ? (
                  [
                    ...currentFilters.subjects,
                    ...currentFilters.streams,
                    ...currentFilters.levels,
                  ].map((value) => (
                    <span
                      key={value}
                      className="rounded-full bg-background px-3 py-1 text-xs font-medium text-foreground"
                    >
                      {value}
                    </span>
                  ))
                ) : (
                  <span className="text-xs">No filters applied yet.</span>
                )}
              </div>
            </div>

            {isLoadingFilters && !filterOptions ? (
              <div className="flex h-32 items-center justify-center text-muted-foreground">
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                Loading filters...
              </div>
            ) : (
              <>
                <FilterSection
                  description="Choose subject-wise areas like IT, biology, chemistry, and more."
                  onToggle={(value) => toggleFilter("subjects", value)}
                  options={filterOptions?.subjects ?? []}
                  selectedValues={draftFilters.subjects}
                  title="Subjects"
                />

                <FilterSection
                  description="Pick the broader field or stream for the questions you want to surface first."
                  onToggle={(value) => toggleFilter("streams", value)}
                  options={filterOptions?.streams ?? []}
                  selectedValues={draftFilters.streams}
                  title="Field / Stream"
                />

                <FilterSection
                  description="Focus the feed by academic level such as school, plus 2, or bachelor."
                  onToggle={(value) => toggleFilter("levels", value)}
                  options={filterOptions?.levels ?? []}
                  selectedValues={draftFilters.levels}
                  title="Level"
                />
              </>
            )}
          </div>

          <SheetFooter className="border-t border-border/70">
            <Button onClick={clearFilters} variant="ghost" disabled={isLoadingFilters || isSyncingFilters}>
              Clear filters
            </Button>
            <Button onClick={applyFilters} disabled={isLoadingFilters || isSyncingFilters}>
              Apply filters
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

type FilterSectionProps = {
  title: string;
  description: string;
  options: readonly string[];
  selectedValues: string[];
  onToggle: (value: string) => void;
};

function FilterSection({
  title,
  description,
  options,
  selectedValues,
  onToggle,
}: FilterSectionProps) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selectedValues.includes(option);

          return (
            <Button
              key={option}
              onClick={() => onToggle(option)}
              size="sm"
              type="button"
              variant={isSelected ? "default" : "outline"}
            >
              {option}
            </Button>
          );
        })}
      </div>
    </section>
  );
}
