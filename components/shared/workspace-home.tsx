"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRightIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Clock3Icon,
  FileIcon,
  FileTextIcon,
  FlameIcon,
  Loader2Icon,
  LightbulbIcon,
  MessageSquareIcon,
  PresentationIcon,
  SearchIcon,
  StarIcon,
  ThumbsUpIcon,
  HelpCircleIcon,
  SendIcon,
  SlidersHorizontalIcon,
  XIcon,
  TrophyIcon,
  MedalIcon,
  MoreHorizontalIcon,
  ImageIcon,
  RefreshCwIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getAnswerFormatLabel,
  getAnswerFormatRequirements,
  hasMediaAnswerFormat,
} from "@/lib/question-types";
import type {
  BaseAnswerFormat,
  FeedQuestion,
  AnswerVisibility,
  ReactionType,
} from "@/types/question";
import {
  QUESTION_CREATED_EVENT,
  QUESTION_FEED_CHANNEL,
  QUESTION_UPDATED_EVENT,
} from "@/lib/pusher/events";
import { QUESTIONS_FEED_PAGE_SIZE } from "@/lib/questions/feed-config";
import { getPusherClient } from "@/lib/pusher/pusherClient";
import { getChannelPath, getProfilePath } from "@/lib/user-paths";
import { cn } from "@/lib/utils";
import {
  prependFeedQuestion,
  setFeedConnectionStatus,
  setFeedQuestions,
  upsertFeedQuestion,
} from "@/store/features/feed/feed-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useWorkspaceFilters } from "@/components/shared/workspace-filter-context";

type WorkspaceRole = "STUDENT" | "TEACHER";
type FeedView =
  | "all"
  | "waiting"
  | "solved"
  | "media"
  | "discussion"
  | "physics"
  | "maths";
type FeedSort = "hot" | "new" | "discussed";
type CoursePricingModel = "FREE" | "SUBSCRIPTION_INCLUDED" | "PAID";

type WorkspaceHomeProps = {
  role: WorkspaceRole;
  userId?: string;
  courseHighlights: WorkspaceCourseHighlight[];
};

type FeedEventPayload = {
  question?: FeedQuestion;
};

type PeerCommentItem = {
  _id: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  studentId?: {
    _id?: string;
    name?: string;
    userImage?: string | null;
    username?: string;
  } | null;
};

type WorkspaceCourseHighlight = {
  id: string;
  slug: string;
  title: string;
  subject: string;
  level: string;
  description: string;
  thumbnailUrl: string | null;
  pricingModel: CoursePricingModel;
  price: number | null;
  instructorName: string;
  lessonsCount: number;
  enrollmentCount: number;
};

type TopTeacherItem = {
  id: string;
  name: string;
  username: string;
  userImage?: string;
  overallScore: number;
  totalAnswered: number;
  teacherModeVerified: boolean;
};

const anyFormatColor = "bg-muted text-muted-foreground";
const formatColorMap: Record<BaseAnswerFormat, string> = {
  TEXT: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  PHOTO: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  VIDEO: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

const visibilityLabelMap: Record<AnswerVisibility, string> = {
  PUBLIC: "Public",
  PRIVATE: "Private inbox",
};

const visibilityColorMap: Record<AnswerVisibility, string> = {
  PUBLIC: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  PRIVATE: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

const statusLabelMap = {
  OPEN: "Open",
  ACCEPTED: "In progress",
  SOLVED: "Solved",
  RESET: "Bumped",
} as const;

const statusColorMap = {
  OPEN: "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900",
  ACCEPTED: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  SOLVED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  RESET: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
} as const;

const REACTION_CONFIG: {
  type: ReactionType;
  icon: typeof ThumbsUpIcon;
  label: string;
}[] = [
  { type: "like", icon: ThumbsUpIcon, label: "Like" },
  { type: "insightful", icon: LightbulbIcon, label: "Insightful" },
  { type: "same_doubt", icon: HelpCircleIcon, label: "Same doubt" },
];

const FEED_VIEW_OPTIONS: { value: FeedView; label: string; icon: LucideIcon }[] = [
  { value: "all", label: "All", icon: BookOpenIcon },
  { value: "waiting", label: "Unanswered", icon: Clock3Icon },
  { value: "solved", label: "Solved", icon: CheckCircle2Icon },
  { value: "physics", label: "Physics", icon: BookOpenIcon },
  { value: "maths", label: "Maths", icon: BookOpenIcon },
  { value: "media", label: "Media", icon: ImageIcon },
  { value: "discussion", label: "Discussion", icon: MessageSquareIcon },
];

const FEED_SORT_OPTIONS: {
  value: FeedSort;
  label: string;
  icon: typeof FlameIcon;
}[] = [
  { value: "hot", label: "Hot", icon: FlameIcon },
  { value: "new", label: "New", icon: Clock3Icon },
  { value: "discussed", label: "Discussed", icon: MessageSquareIcon },
];

const COURSE_FALLBACK_GRADIENTS = [
  "from-sky-500 via-indigo-500 to-violet-500",
  "from-emerald-500 via-teal-500 to-cyan-500",
  "from-amber-500 via-orange-500 to-rose-500",
  "from-slate-500 via-slate-700 to-slate-900",
] as const;

function formatTimeAgo(value: string) {
  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "just now";
  }

  const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60000));

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hr ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatCoursePrice(course: WorkspaceCourseHighlight) {
  if (course.pricingModel === "FREE") {
    return "Free";
  }

  if (course.pricingModel === "SUBSCRIPTION_INCLUDED") {
    return "Subscription";
  }

  if (typeof course.price === "number" && Number.isFinite(course.price)) {
    return `NPR ${course.price.toLocaleString()}`;
  }

  return "Paid";
}

function getQuestionChips(question: FeedQuestion) {
  return [question.level, question.stream, question.subject].filter(
    Boolean,
  ) as string[];
}

function dedupeComments(comments: PeerCommentItem[]) {
  const unique = new Map<string, PeerCommentItem>();

  for (const comment of comments) {
    if (comment?._id) {
      unique.set(comment._id, comment);
    }
  }

  return Array.from(unique.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function WorkspaceHome({
  role,
  userId,
  courseHighlights,
}: WorkspaceHomeProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { filters: activeFilters, clearFilters: clearWorkspaceFilters } =
    useWorkspaceFilters();
  const { items: feedItems, isHydrated } = useAppSelector(
    (state) => state.feed,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [expandedAnswers, setExpandedAnswers] = useState<Set<string>>(
    new Set(),
  );
  const [expandedComments, setExpandedComments] = useState<Set<string>>(
    new Set(),
  );
  const [commentsMap, setCommentsMap] = useState<
    Record<string, PeerCommentItem[]>
  >({});
  const [commentInput, setCommentInput] = useState<Record<string, string>>({});
  const [isSubmittingComment, setIsSubmittingComment] = useState<string | null>(
    null,
  );
  const [activeView, setActiveView] = useState<FeedView>("all");
  const [activeSort, setActiveSort] = useState<FeedSort>(
    role === "STUDENT" ? "hot" : "new",
  );
  const [feedSearch, setFeedSearch] = useState("");
  const [mobileFeedOptionsOpen, setMobileFeedOptionsOpen] = useState(false);
  const [activeCourseIndex, setActiveCourseIndex] = useState(0);
  const [topTeachers, setTopTeachers] = useState<TopTeacherItem[]>([]);
  const [isTopTeachersLoading, setIsTopTeachersLoading] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Community notes state
  type CommunityNoteItem = {
    id: string;
    title: string;
    subject: string;
    grade: string;
    fileType: "PDF" | "DOCX" | "PPT" | "Image";
    uploaderName: string;
    createdAt: string;
  };
  const [communityNotes, setCommunityNotes] = useState<CommunityNoteItem[]>([]);
  const [isCommunityNotesLoading, setIsCommunityNotesLoading] = useState(false);

  const toggleAnswer = (questionId: string) => {
    setExpandedAnswers((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  const fetchComments = async (questionId: string) => {
    try {
      const res = await fetch(`/api/questions/${questionId}/comments`);
      if (res.ok) {
        const data = (await res.json()) as PeerCommentItem[];
        setCommentsMap((prev) => ({
          ...prev,
          [questionId]: dedupeComments(data),
        }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleComments = (questionId: string) => {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
        if (!commentsMap[questionId]) {
          fetchComments(questionId);
        }
      }
      return next;
    });
  };

  const submitComment = async (questionId: string) => {
    const text = commentInput[questionId]?.trim();
    if (!text) return;

    setIsSubmittingComment(questionId);
    try {
      const res = await fetch(`/api/questions/${questionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json();

      if (res.ok) {
        const incomingComment = data.comment as PeerCommentItem;
        const alreadyExists = (commentsMap[questionId] || []).some(
          (comment) => comment._id === incomingComment._id,
        );

        setCommentsMap((prev) => {
          const existing = prev[questionId] || [];
          const nextComments = dedupeComments([incomingComment, ...existing]);
          return { ...prev, [questionId]: nextComments };
        });
        setCommentInput((prev) => ({ ...prev, [questionId]: "" }));

        // Optimistically update the comment count on the question feed item
        const qIndex = feedItems.findIndex((q) => q.id === questionId);
        if (!alreadyExists && qIndex >= 0) {
          const updatedQ = {
            ...feedItems[qIndex],
            commentCount: (feedItems[qIndex].commentCount || 0) + 1,
          };
          dispatch(upsertFeedQuestion(updatedQ));
        }

        if (data.milestoneReached) {
          toast.success(
            data.milestoneMessage ||
              `Milestone! You earned NPR ${data.pointsAwarded}.`,
          );
        }
      } else {
        toast.error(data.error || "Failed to post comment");
      }
    } catch {
      toast.error("Failed to post comment");
    } finally {
      setIsSubmittingComment(null);
    }
  };

  // Fetch feed from API on mount
  const fetchFeed = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/questions/feed?limit=${QUESTIONS_FEED_PAGE_SIZE}`);
      if (res.ok) {
        const data: FeedQuestion[] = await res.json();
        dispatch(setFeedQuestions(data));
      }
    } catch {
      // Silently fall back — Pusher will keep it updated
    } finally {
      setIsLoading(false);
    }
  }, [dispatch]);

  useEffect(() => {
    if (!isHydrated) {
      fetchFeed();
    }
  }, [fetchFeed, isHydrated]);

  useEffect(() => {
    if (courseHighlights.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveCourseIndex(
        (current) => (current + 1) % courseHighlights.length,
      );
    }, 4500);

    return () => window.clearInterval(timer);
  }, [courseHighlights.length]);

  useEffect(() => {
    if (courseHighlights.length === 0) {
      setActiveCourseIndex(0);
      return;
    }

    setActiveCourseIndex((current) => current % courseHighlights.length);
  }, [courseHighlights.length]);

  useEffect(() => {
    let isMounted = true;

    const fetchTopTeachers = async () => {
      setIsTopTeachersLoading(true);
      try {
        const res = await fetch("/api/teachers/top-rated");
        if (!res.ok) {
          return;
        }

        const data = (await res.json()) as TopTeacherItem[];
        if (isMounted) {
          setTopTeachers(data);
        }
      } catch {
        // Keep the rail resilient even if this optional data fails.
      } finally {
        if (isMounted) {
          setIsTopTeachersLoading(false);
        }
      }
    };

    fetchTopTeachers();

    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch community notes
  useEffect(() => {
    let isMounted = true;

    const fetchCommunityNotes = async () => {
      setIsCommunityNotesLoading(true);
      try {
        const res = await fetch("/api/notes?limit=5");
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted) setCommunityNotes(data);
      } catch {
        // Keep resilient
      } finally {
        if (isMounted) setIsCommunityNotesLoading(false);
      }
    };

    fetchCommunityNotes();

    return () => {
      isMounted = false;
    };
  }, []);

  // Pusher real-time subscription
  useEffect(() => {
    const client = getPusherClient();

    if (!client) {
      return;
    }

    dispatch(setFeedConnectionStatus("connecting"));

    const channel = client.subscribe(QUESTION_FEED_CHANNEL);

    const handleCreated = (payload: FeedEventPayload) => {
      if (!payload.question) {
        return;
      }

      dispatch(prependFeedQuestion(payload.question));
    };

    const handleUpdated = (payload: FeedEventPayload) => {
      if (!payload.question) {
        return;
      }

      dispatch(upsertFeedQuestion(payload.question));
    };

    const handleConnected = () => {
      dispatch(setFeedConnectionStatus("connected"));
    };

    const handleError = () => {
      dispatch(setFeedConnectionStatus("failed"));
    };

    channel.bind(QUESTION_CREATED_EVENT, handleCreated);
    channel.bind(QUESTION_UPDATED_EVENT, handleUpdated);
    client.connection.bind("connected", handleConnected);
    client.connection.bind("error", handleError);

    return () => {
      channel.unbind(QUESTION_CREATED_EVENT, handleCreated);
      channel.unbind(QUESTION_UPDATED_EVENT, handleUpdated);
      client.connection.unbind("connected", handleConnected);
      client.connection.unbind("error", handleError);
      client.unsubscribe(QUESTION_FEED_CHANNEL);
    };
  }, [dispatch]);

  // Handle accept question
  const handleAccept = async (questionId: string) => {
    setAcceptingId(questionId);
    try {
      const res = await fetch(`/api/questions/${questionId}/accept`, {
        method: "POST",
      });

      if (res.ok) {
        const data = await res.json();
        // Update feed state
        dispatch(upsertFeedQuestion(data as FeedQuestion));
        // Auto-redirect to the channel
        if (data.channelId) {
          router.push(`/channel/${data.channelId}`);
        }
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setAcceptingId(null);
    }
  };

  // Handle reaction toggle
  const handleReact = async (questionId: string, type: ReactionType) => {
    if (!userId) return;

    const targetQuestion = feedItems.find((item) => item.id === questionId);
    if (!targetQuestion) return;

    // Optimistically calculate new reactions
    const userReactionIndex = targetQuestion.reactions.findIndex(
      (r) => r.userId === userId,
    );
    const newReactions = [...targetQuestion.reactions];

    if (userReactionIndex >= 0) {
      if (newReactions[userReactionIndex].type === type) {
        // Same reaction clicked, toggle it off
        newReactions.splice(userReactionIndex, 1);
      } else {
        // Different reaction clicked, switch to the new one
        newReactions[userReactionIndex] = {
          ...newReactions[userReactionIndex],
          type,
        };
      }
    } else {
      // No prior reaction, add it
      newReactions.push({ userId, type });
    }

    const optimisticQuestion = { ...targetQuestion, reactions: newReactions };
    dispatch(upsertFeedQuestion(optimisticQuestion));

    try {
      const res = await fetch(`/api/questions/${questionId}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });

      if (res.ok) {
        const updated: FeedQuestion = await res.json();
        dispatch(upsertFeedQuestion(updated));
      } else {
        // Revert on fail
        dispatch(upsertFeedQuestion(targetQuestion));
      }
    } catch {
      // Revert on fail
      dispatch(upsertFeedQuestion(targetQuestion));
    }
  };

  const searchSubjects = activeFilters.subjects;
  const searchStreams = activeFilters.streams;
  const searchLevels = activeFilters.levels;

  const activeHeaderFilters = [
    ...searchSubjects,
    ...searchStreams,
    ...searchLevels,
  ];

  const visibleFeedItems = [...feedItems]
    .filter((item) => {
      const normalizedSearch = feedSearch.trim().toLowerCase();
      if (normalizedSearch.length > 0) {
        const haystack = [
          item.title,
          item.body,
          item.subject,
          item.stream,
          item.level,
          item.askerName,
          item.askerUsername,
          item.acceptedByName,
          item.previewAuthor,
          item.previewText,
          item.answer?.content,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(normalizedSearch)) {
          return false;
        }
      }

      if (activeHeaderFilters.length > 0) {
        const matchesSubject =
          searchSubjects.length === 0 ||
          (item.subject && searchSubjects.includes(item.subject));
        const matchesStream =
          searchStreams.length === 0 ||
          (item.stream && searchStreams.includes(item.stream));
        const matchesLevel =
          searchLevels.length === 0 ||
          (item.level && searchLevels.includes(item.level));

        if (!(matchesSubject && matchesStream && matchesLevel)) {
          return false;
        }
      }

      switch (activeView) {
        case "waiting":
          return item.status !== "SOLVED";
        case "solved":
          return item.status === "SOLVED";
        case "media":
          return (
            (item.images?.length ?? 0) > 0 ||
            hasMediaAnswerFormat(item.answerFormat) ||
            (item.answer?.mediaUrls?.length ?? 0) > 0
          );
        case "discussion":
          return item.commentCount > 0;
        case "physics":
          return item.subject?.toLowerCase().includes("physics") ?? false;
        case "maths":
          return (
            item.subject?.toLowerCase().includes("math") ||
            item.subject?.toLowerCase().includes("maths") ||
            item.title.toLowerCase().includes("math")
          );
        default:
          return true;
      }
    })
    .sort((a, b) => {
      const createdAtDiff =
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

      if (activeSort === "new") {
        return createdAtDiff;
      }

      if (activeSort === "discussed") {
        return (
          b.commentCount - a.commentCount ||
          b.reactions.length - a.reactions.length ||
          createdAtDiff
        );
      }

      const getHotScore = (item: FeedQuestion) =>
        item.reactions.length * 2 +
        item.commentCount * 3 +
        item.answerCount * 4 +
        (item.status === "RESET" ? 2 : 0) +
        (item.status === "ACCEPTED" ? 1 : 0);

      return getHotScore(b) - getHotScore(a) || createdAtDiff;
    });

  const mobileCourseRail = (
    <section className="space-y-3 md:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Browse courses
          </p>
        </div>
        <Button asChild size="sm" variant="ghost" className="shrink-0">
          <Link href="/courses">See all</Link>
        </Button>
      </div>

      {courseHighlights.length > 0 ? (
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [overscroll-behavior-x:contain] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {courseHighlights.map((course, index) => (
            <Link
              key={course.id}
              href={`/courses/${course.slug}`}
              className="group relative h-[9.5rem] w-[8.5rem] shrink-0 snap-start overflow-hidden rounded-[1.5rem] border border-border/70 bg-background shadow-sm transition-colors hover:border-primary/30"
            >
              <div
                className={cn(
                  "relative h-full w-full bg-gradient-to-br",
                  COURSE_FALLBACK_GRADIENTS[
                    index % COURSE_FALLBACK_GRADIENTS.length
                  ],
                )}
              >
                {course.thumbnailUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={course.thumbnailUrl}
                      alt={course.title}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-slate-950/45" />
                  </>
                ) : null}
                <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(15,23,42,0.88),rgba(15,23,42,0.18))]" />
                <div className="absolute left-2.5 top-2.5 max-w-[45%] truncate rounded-full bg-white/15 px-2 py-1 text-[9px] font-semibold text-white backdrop-blur-sm">
                  {course.subject}
                </div>
                <div className="absolute right-2.5 top-2.5 rounded-full bg-black/20 px-2 py-1 text-[9px] font-semibold text-white backdrop-blur-sm">
                  {formatCoursePrice(course)}
                </div>
                <div className="absolute inset-x-3 bottom-3">
                  <p className="line-clamp-2 text-sm font-semibold text-white">
                    {course.title}
                  </p>
                  <p className="mt-1 line-clamp-1 text-[11px] text-white/80">
                    {course.instructorName}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 p-4 text-sm text-muted-foreground">
          No active courses yet.
        </div>
      )}
    </section>
  );

  const renderCourseHighlightsPanel = () => (
    <Card className="overflow-hidden border border-border/70 bg-background shadow-sm">
      <CardHeader className="border-b border-border/60 pb-4">
        <CardDescription>Courses</CardDescription>
        <CardTitle className="text-base">Course highlights</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {courseHighlights.length > 0 ? (
          <>
            <div className="overflow-hidden rounded-2xl">
              <div
                className="flex transition-transform duration-500 ease-out"
                style={{
                  transform: `translateX(-${activeCourseIndex * 100}%)`,
                }}
              >
                {courseHighlights.map((course, index) => (
                  <div key={course.id} className="min-w-full">
                    <Link
                      href={`/courses/${course.slug}`}
                      className="block overflow-hidden rounded-2xl border border-border/70 bg-background transition-colors hover:border-primary/30"
                    >
                      <div
                        className={cn(
                          "relative h-40 bg-gradient-to-br",
                          COURSE_FALLBACK_GRADIENTS[
                            index % COURSE_FALLBACK_GRADIENTS.length
                          ],
                        )}
                      >
                        {course.thumbnailUrl ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={course.thumbnailUrl}
                              alt={course.title}
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                            <div className="absolute inset-0 bg-slate-950/45" />
                          </>
                        ) : null}
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.35),transparent_45%)]" />
                        <div className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-black/20 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                          <BookOpenIcon className="size-3" />
                          {course.subject}
                        </div>
                        <div className="absolute right-4 top-4 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                          {formatCoursePrice(course)}
                        </div>
                        <div className="absolute inset-x-4 bottom-4">
                          <p className="text-lg font-semibold text-white">
                            {course.title}
                          </p>
                          <p className="mt-1 text-sm text-white/85">
                            {course.level}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3 p-4">
                        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground whitespace-pre-wrap">
                          {course.description ||
                            "Structured lessons and guided practice from the course library."}
                        </p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{course.lessonsCount} lessons</span>
                          <span>{course.enrollmentCount} learners</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>By {course.instructorName}</span>
                          <span className="inline-flex items-center gap-1 font-medium text-primary">
                            Open course
                            <ArrowUpRightIcon className="size-3.5" />
                          </span>
                        </div>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {courseHighlights.map((course, index) => (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => setActiveCourseIndex(index)}
                    className={cn(
                      "size-2.5 rounded-full transition-colors",
                      index === activeCourseIndex ? "bg-primary" : "bg-border",
                    )}
                    aria-label={`Show course ${index + 1}`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setActiveCourseIndex((current) =>
                      current === 0 ? courseHighlights.length - 1 : current - 1,
                    )
                  }
                  className="inline-flex size-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Previous course"
                  disabled={courseHighlights.length <= 1}
                >
                  <ChevronLeftIcon className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setActiveCourseIndex(
                      (current) => (current + 1) % courseHighlights.length,
                    )
                  }
                  className="inline-flex size-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Next course"
                  disabled={courseHighlights.length <= 1}
                >
                  <ChevronRightIcon className="size-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 p-5">
            <p className="text-sm font-medium text-foreground">
              No active courses yet
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              As soon as courses are published, they will appear here
              automatically.
            </p>
            <Button asChild size="sm" className="mt-4">
              <Link href="/courses">Browse courses</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderTopTeachersPanel = () => (
    <Card className="relative overflow-hidden border border-border/70 bg-background shadow-lg">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500" />
      <div className="absolute -right-10 -top-10 size-40 rounded-full bg-primary/5 blur-3xl" />

      <CardHeader className="relative border-b border-border/60 pb-5">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 font-bold text-white shadow-inner">
            <TrophyIcon className="size-4" />
          </div>
          <div>
            <CardTitle className="text-base tracking-tight">
              Hall of Fame
            </CardTitle>
            <CardDescription className="text-xs">
              Top rated teachers this week
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative space-y-3 pt-5">
        {isTopTeachersLoading ? (
          [1, 2, 3].map((item) => (
            <div
              key={item}
              className="flex items-center gap-3 rounded-2xl border border-border/50 bg-muted/10 p-3"
            >
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))
        ) : topTeachers.length > 0 ? (
          topTeachers.map((teacher, index) => {
            const isFirst = index === 0;
            const isSecond = index === 1;
            const isThird = index === 2;

            let rankColors = "bg-muted text-muted-foreground border-border/50";
            let rankIcon = null;

            if (isFirst) {
              rankColors =
                "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400";
              rankIcon = <MedalIcon className="size-3.5" />;
            } else if (isSecond) {
              rankColors =
                "bg-slate-300/20 text-slate-600 border-slate-400/30 dark:text-slate-300 dark:bg-slate-500/20";
              rankIcon = <MedalIcon className="size-3.5" />;
            } else if (isThird) {
              rankColors =
                "bg-orange-600/10 text-orange-700 border-orange-600/20 dark:text-orange-400 dark:bg-orange-500/10";
              rankIcon = <MedalIcon className="size-3.5" />;
            }

            return (
              <Link
                key={teacher.id}
                href={getProfilePath({
                  id: teacher.id,
                  name: teacher.name,
                  username: teacher.username,
                })}
                className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-border/50 bg-background p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted/20 hover:shadow-md"
              >
                {/* Ranking Badge */}
                <div
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold shadow-sm transition-colors duration-300",
                    rankColors,
                  )}
                >
                  {rankIcon || index + 1}
                </div>

                {/* Avatar with optional ring for top 3 */}
                <div className="relative shrink-0">
                  {teacher.userImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={teacher.userImage}
                      alt={teacher.name}
                      className={cn(
                        "size-10 rounded-full object-cover shadow-sm transition-transform duration-300 group-hover:scale-105",
                        isFirst
                          ? "ring-2 ring-amber-500 ring-offset-1 ring-offset-background"
                          : isSecond
                            ? "ring-2 ring-slate-400 ring-offset-1 ring-offset-background"
                            : isThird
                              ? "ring-2 ring-orange-500 ring-offset-1 ring-offset-background"
                              : "border border-border/60",
                      )}
                    />
                  ) : (
                    <div
                      className={cn(
                        "flex size-10 items-center justify-center rounded-full text-sm font-semibold shadow-sm transition-transform duration-300 group-hover:scale-105",
                        isFirst
                          ? "bg-amber-500/15 text-amber-600 ring-2 ring-amber-500 ring-offset-1 ring-offset-background"
                          : isSecond
                            ? "bg-slate-500/15 text-slate-700 ring-2 ring-slate-400 ring-offset-1 ring-offset-background"
                            : isThird
                              ? "bg-orange-500/15 text-orange-700 ring-2 ring-orange-500 ring-offset-1 ring-offset-background"
                              : "bg-primary/10 text-primary border border-border/60",
                      )}
                    >
                      {teacher.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {teacher.teacherModeVerified && (
                    <div className="absolute -bottom-1 -right-1 rounded-full border-2 border-background bg-emerald-500 p-0.5">
                      <CheckCircle2Icon
                        className="size-2.5 text-white"
                        strokeWidth={4}
                      />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-bold text-foreground transition-colors group-hover:text-primary">
                      {teacher.name}
                    </p>
                    <div className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary">
                      {teacher.totalAnswered}{" "}
                      <span className="hidden sm:inline">answers</span>
                    </div>
                  </div>

                  <div className="mt-1 flex items-center justify-between text-xs">
                    <p className="truncate text-muted-foreground">
                      @{teacher.username}
                    </p>
                    <div className="flex items-center gap-1 font-semibold text-foreground">
                      <StarIcon className="size-3.5 fill-amber-400 text-amber-400" />
                      {teacher.overallScore.toFixed(1)}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
            <TrophyIcon className="mb-3 size-8 text-muted-foreground/30" />
            <p className="font-medium text-foreground">No top teachers yet</p>
            <p className="mt-1 max-w-[200px] text-xs">
              Ratings are calculated periodically. Help out to climb the ranks!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const NOTE_FILE_TYPE_ICON: Record<string, typeof FileTextIcon> = {
    PDF: FileTextIcon,
    DOCX: FileIcon,
    PPT: PresentationIcon,
    Image: ImageIcon,
  };

  const NOTE_FILE_TYPE_COLOR: Record<string, string> = {
    PDF: "text-red-600 dark:text-red-400",
    DOCX: "text-blue-600 dark:text-blue-400",
    PPT: "text-amber-600 dark:text-amber-400",
    Image: "text-violet-600 dark:text-violet-400",
  };

  const NOTE_FILE_TYPE_BG: Record<string, string> = {
    PDF: "bg-red-500/10",
    DOCX: "bg-blue-500/10",
    PPT: "bg-amber-500/10",
    Image: "bg-violet-500/10",
  };

  const renderCommunityNotesPanel = () => (
    <Card className="overflow-hidden border border-border/70 bg-background shadow-sm">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 font-bold text-white shadow-inner">
              <FileTextIcon className="size-4" />
            </div>
            <div>
              <CardTitle className="text-base tracking-tight">Community Notes</CardTitle>
              <CardDescription className="text-xs">Latest shared study notes</CardDescription>
            </div>
          </div>
          <Button asChild size="sm" variant="ghost" className="shrink-0 text-xs">
            <Link href="/notes">View all</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5 pt-4">
        {isCommunityNotesLoading ? (
          [1, 2, 3].map((item) => (
            <div
              key={item}
              className="flex items-center gap-3 rounded-2xl border border-border/50 bg-muted/10 p-3"
            >
              <Skeleton className="size-9 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))
        ) : communityNotes.length > 0 ? (
          communityNotes.map((note) => {
            const NoteIcon = NOTE_FILE_TYPE_ICON[note.fileType] || FileTextIcon;
            const iconColor = NOTE_FILE_TYPE_COLOR[note.fileType] || "text-muted-foreground";
            const iconBg = NOTE_FILE_TYPE_BG[note.fileType] || "bg-muted";

            return (
              <Link
                key={note.id}
                href={`/notes/${note.id}`}
                className="group flex items-center gap-3 overflow-hidden rounded-2xl border border-border/50 bg-background p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
              >
                <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", iconBg)}>
                  <NoteIcon className={cn("size-4.5", iconColor)} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                    {note.title}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="font-medium">{note.subject}</span>
                    <span className="size-0.5 rounded-full bg-muted-foreground/50" />
                    <span>{note.grade}</span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    by {note.uploaderName} · {formatTimeAgo(note.createdAt)}
                  </p>
                </div>
              </Link>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
            <FileTextIcon className="mb-3 size-8 text-muted-foreground/30" />
            <p className="font-medium text-foreground">No notes yet</p>
            <p className="mt-1 max-w-[200px] text-xs">
              Share your study notes with the community!
            </p>
            <Button asChild size="sm" className="mt-3">
              <Link href="/notes">Upload a note</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 flex flex-col gap-6">
          <section className="order-1 -mx-4 border-b-8 border-[#f4f6f8] bg-background px-[18px] pb-2 pt-1 md:hidden dark:border-muted">
            <div className="mt-2 flex items-center gap-2">
              <div
                className={cn(
                  "flex h-[42px] flex-1 items-center gap-2 rounded-[13px] border-[1.5px] px-3.5",
                  feedSearch
                    ? "border-emerald-200 bg-[#f4f6f8]"
                    : "border-transparent bg-[#f4f6f8] dark:bg-muted",
                )}
              >
                <SearchIcon className="size-[19px] shrink-0 text-[#9AA3AA]" />
                <input
                  value={feedSearch}
                  onChange={(event) => setFeedSearch(event.target.value)}
                  placeholder="Search questions & courses..."
                  className="min-w-0 flex-1 bg-transparent text-[14.5px] font-medium text-foreground outline-none placeholder:text-[#9AA3AA]"
                  type="search"
                />
                {feedSearch ? (
                  <button
                    type="button"
                    onClick={() => setFeedSearch("")}
                    className="flex size-[19px] items-center justify-center rounded-full bg-[#D7DCE1] text-[11px] font-bold text-white"
                    aria-label="Clear search"
                  >
                    <XIcon className="size-3" />
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setMobileFeedOptionsOpen((open) => !open)}
                className="relative flex size-[38px] shrink-0 items-center justify-center rounded-[11px] bg-[#0F1F17] text-white active:scale-95"
                aria-label="Filters"
              >
                <SlidersHorizontalIcon className="size-[18px]" />
                {activeHeaderFilters.length > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-extrabold text-white">
                    {activeHeaderFilters.length}
                  </span>
                ) : null}
              </button>
            </div>

            {mobileFeedOptionsOpen ? (
              <div className="mt-2 rounded-2xl border border-border bg-background p-3 shadow-sm">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Sort
                </p>
                <div className="flex flex-wrap gap-2">
                  {FEED_SORT_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setActiveSort(value)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-semibold",
                        activeSort === value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                  {activeHeaderFilters.length > 0 ? (
                    <button
                      type="button"
                      onClick={clearWorkspaceFilters}
                      className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-600"
                    >
                      Clear filters
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {FEED_VIEW_OPTIONS.filter((option) =>
                ["all", "waiting", "solved", "physics", "maths"].includes(
                  option.value,
                ),
              ).map((option) => {
                const active = activeView === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setActiveView(option.value)}
                    className={cn(
                      "shrink-0 rounded-full border px-[13px] py-1.5 text-[13px] font-semibold",
                      active
                        ? "border-[#0F1F17] bg-[#0F1F17] text-white"
                        : "border-[#E6EAEE] bg-background text-muted-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>

          <Card className="order-1 hidden overflow-hidden border border-border/70 bg-background shadow-sm md:block">
            <CardContent className="overflow-x-auto px-3 py-2 sm:px-6 sm:py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-max items-center gap-2">
                {FEED_VIEW_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setActiveView(option.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-all duration-200",
                      activeView === option.value
                        ? "border-foreground bg-foreground text-background shadow-sm hover:border-foreground/90 hover:bg-foreground/90"
                        : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-primary/[0.08] hover:text-foreground hover:shadow-sm",
                    )}
                  >
                    <option.icon className="size-3" />
                    {option.label}
                  </button>
                ))}

                <div className="mx-1 h-5 w-px bg-border/80" />
                <span className="text-[11px] font-medium text-muted-foreground">
                  Sort
                </span>

                {FEED_SORT_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setActiveSort(value)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap",
                      activeSort === value
                        ? "border-primary/45 bg-primary/14 text-primary shadow-sm dark:bg-primary/18"
                        : "border-border/80 bg-background text-muted-foreground hover:border-primary/30 hover:bg-primary/[0.08] hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3" />
                    {label}
                  </button>
                ))}

                <div className="mx-1 h-5 w-px bg-border/80" />
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                  <SlidersHorizontalIcon className="size-3" />
                  Filters
                </span>

                {activeHeaderFilters.length > 0 ? (
                  <>
                    {activeHeaderFilters.map((filterValue) => (
                      <span
                        key={filterValue}
                        className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground whitespace-nowrap"
                      >
                        {filterValue}
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={clearWorkspaceFilters}
                      className="ml-1 inline-flex items-center justify-center rounded-full bg-red-500/10 px-1.5 py-1 text-red-600 transition-colors hover:bg-red-500/20"
                      title="Clear filters"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </>
                ) : (
                  <span className="rounded-full border border-dashed border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground whitespace-nowrap">
                    None
                  </span>
                )}

                <div className="mx-1 h-5 w-px bg-border/80" />
                <button
                  type="button"
                  onClick={fetchFeed}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-all duration-200 hover:border-primary/30 hover:bg-primary/[0.08] hover:text-foreground hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                  title="Refresh feed manually"
                >
                  {isLoading ? (
                    <Loader2Icon className="size-3 animate-spin" />
                  ) : (
                    <RefreshCwIcon className="size-3" />
                  )}
                  Refresh
                </button>
              </div>
            </CardContent>
          </Card>

          <div className="order-2">{mobileCourseRail}</div>

          <div className="order-3 -mx-4 border-t-8 border-[#f4f6f8] bg-background px-[18px] pb-1 pt-2 md:hidden dark:border-muted">
            <div className="flex items-center justify-between">
              <p className="text-[12.5px] font-extrabold uppercase tracking-[1.1px] text-[#9AA3AA]">
                Questions
              </p>
            </div>
          </div>

          <div className="order-4 space-y-0 md:space-y-6">
            {/* Loading skeleton */}
            {isLoading && !isHydrated && (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="border border-border/70 shadow-sm">
                    <CardHeader>
                      <Skeleton className="h-3 w-48" />
                      <Skeleton className="h-5 w-72 mt-2" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Empty state & Fallback */}
            {!isLoading && visibleFeedItems.length === 0 && (
              <Card className="border border-dashed border-border/70 shadow-sm">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <MessageSquareIcon className="size-12 text-muted-foreground/40 mb-4" />
                  <p className="text-lg font-medium text-foreground">
                    {feedItems.length === 0
                      ? "No questions yet"
                      : "No posts match this view"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                    {feedItems.length === 0
                      ? 'Be the first to post a question! Click "Post Question" in the header to get started.'
                      : "Try a different filter or sort to bring more questions back into the stream."}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-6 gap-2"
                    onClick={fetchFeed}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <RefreshCwIcon className="size-4" />
                    )}
                    Load Questions
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Feed cards */}
            {visibleFeedItems.map((item) => {
              const isAccepted = item.status === "ACCEPTED";
              const isSolved = item.status === "SOLVED";
              const isOwnQuestion = userId === item.askerId;
              const canAccept =
                !isOwnQuestion &&
                (item.status === "OPEN" || item.status === "RESET") &&
                role === "TEACHER";
              const canOpenThread = isOwnQuestion && Boolean(item.channelId);
              const canComment = !isOwnQuestion;
              const isExpandedComments = expandedComments.has(item.id);
              const comments = dedupeComments(commentsMap[item.id] || []);
              const isAcceptLoading = acceptingId === item.id;
              const totalReactions = item.reactions.length;
              // No asker id means the account is gone ("Anonymous"): a handle
              // derived from that name would link to a 404.
              const askerProfileHref = item.askerId
                ? getProfilePath({
                    id: item.askerId,
                    name: item.askerName,
                    username: item.askerUsername,
                  })
                : null;

              // Determine which reaction the current user has (if any)
              const userReaction = userId
                ? item.reactions.find((r) => r.userId === userId)
                : undefined;
              const requiredAnswerFormats = getAnswerFormatRequirements(
                item.answerFormat,
              );
              const questionChips = getQuestionChips(item);

              return (
                <article
                  key={item.id}
                  className="min-w-0 overflow-hidden border-y border-border/60 bg-background shadow-none transition-all hover:border-border md:rounded-2xl md:border md:shadow-sm md:hover:shadow-md"
                >
                  <div className="min-w-0 grid md:grid-cols-[64px_minmax(0,1fr)]">
                    <div className="hidden md:flex items-center justify-between gap-2 border-b border-border/60 bg-muted/25 px-4 py-3 md:min-h-full md:flex-col md:justify-start md:gap-3 md:border-b-0 md:border-r md:px-2 md:py-4">
                      {REACTION_CONFIG.map(({ type, icon: Icon, label }) => {
                        const count = item.reactions.filter(
                          (reaction) => reaction.type === type,
                        ).length;
                        const isActive = userReaction?.type === type;

                        return (
                          <button
                            key={type}
                            type="button"
                            title={label}
                            onClick={() => handleReact(item.id, type)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition-colors md:min-w-[44px] md:flex-col md:rounded-2xl md:px-2 md:py-2",
                              isActive
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-border bg-background text-muted-foreground hover:text-foreground",
                            )}
                          >
                            <Icon className="size-3.5" />
                            <span>{count}</span>
                          </button>
                        );
                      })}

                      <div className="hidden text-center text-[10px] text-muted-foreground md:block">
                        <div className="font-semibold text-foreground">
                          {totalReactions}
                        </div>
                        <div>reacts</div>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="space-y-4 px-[18px] py-[19px] md:px-4 md:py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <Link
                              href={askerProfileHref ?? "#"}
                              className={cn(
                                "group/avatar relative z-10 flex shrink-0 items-center justify-center",
                                !askerProfileHref && "pointer-events-none",
                              )}
                              aria-label={`Open ${item.askerName}'s profile`}
                              aria-disabled={!askerProfileHref}
                              tabIndex={askerProfileHref ? undefined : -1}
                            >
                              {item.askerImage ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={item.askerImage}
                                  alt={item.askerName}
                                  className="size-[42px] shrink-0 rounded-full border-[1.5px] border-border/80 object-cover shadow-sm transition-transform duration-300 group-hover/avatar:scale-105 group-hover/avatar:shadow-md md:size-9"
                                />
                              ) : (
                                <div className="flex size-[42px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-primary/20 bg-gradient-to-br from-primary/20 to-primary/5 text-base font-bold text-primary shadow-sm transition-transform duration-300 group-hover/avatar:scale-105 group-hover/avatar:shadow-md md:size-9 md:text-sm">
                                  {item.askerName.charAt(0).toUpperCase()}
                                </div>
                              )}
                              {item.askerIsOnline ? (
                                <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-background bg-emerald-500 md:size-2.5" />
                              ) : null}
                            </Link>

                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5">
                                {askerProfileHref ? (
                                  <Link
                                    href={askerProfileHref}
                                    className="text-[15px] font-bold tracking-tight text-foreground transition-colors hover:text-primary hover:underline"
                                  >
                                    {item.askerName}
                                  </Link>
                                ) : (
                                  <span className="text-[15px] font-bold tracking-tight text-foreground">
                                    {item.askerName}
                                  </span>
                                )}
                                {item.askerIsOnline ? (
                                  <span
                                    className="size-[7px] rounded-full bg-emerald-500"
                                    aria-label="Online"
                                    title="Online"
                                  />
                                ) : null}
                                {item.askerUsername && (
                                  <span className="hidden text-[13px] font-medium text-muted-foreground/60 sm:inline-block">
                                    @{item.askerUsername}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
                                <span>{formatTimeAgo(item.createdAt)}</span>
                                <span className="size-1 rounded-full bg-muted-foreground/50" />
                                <span className="text-foreground/80">
                                  {item.subject ||
                                    item.stream ||
                                    item.level ||
                                    "General"}
                                </span>
                                <span className="hidden size-1 rounded-full bg-muted-foreground/50 sm:block" />
                                <span className="hidden text-[9px] font-bold uppercase tracking-wider opacity-80 sm:inline-block">
                                  {item.answerVisibility === "PUBLIC"
                                    ? "Public"
                                    : "Private"}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "hidden md:inline-flex rounded-full border border-border/20 px-2.5 py-1 text-[11px] font-semibold shadow-sm",
                                statusColorMap[item.status],
                              )}
                            >
                              {statusLabelMap[item.status]}
                            </span>

                            <div className="group/dots relative">
                              <button
                                type="button"
                                aria-label="View question details"
                                onClick={() =>
                                  setOpenMenuId(
                                    openMenuId === item.id ? null : item.id,
                                  )
                                }
                                className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-muted/80 hover:text-foreground hover:shadow-sm"
                              >
                                <MoreHorizontalIcon className="size-5" />
                              </button>

                              <div
                                className={cn(
                                  "absolute right-0 top-full z-10 mt-2 w-[280px] origin-top-right rounded-2xl border border-border/60 bg-background/98 p-4 shadow-xl shadow-black/5 backdrop-blur-xl transition-all duration-200 dark:shadow-black/20 group-hover/dots:visible group-hover/dots:scale-100 group-hover/dots:opacity-100",
                                  openMenuId === item.id
                                    ? "visible scale-100 opacity-100"
                                    : "invisible scale-95 opacity-0",
                                )}
                              >
                                <div className="space-y-4">
                                  {item.resetCount > 0 && (
                                    <>
                                      <div>
                                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                                          Question Status
                                        </p>
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                                            Reset {item.resetCount} times
                                          </span>
                                        </div>
                                      </div>
                                      <div className="h-px w-full bg-border/50" />
                                    </>
                                  )}

                                  <div>
                                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                                      Details & Formats
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {requiredAnswerFormats.length === 0 ? (
                                        <span
                                          className={cn(
                                            "rounded-md px-2 py-1 text-[10px] font-medium shadow-sm",
                                            anyFormatColor,
                                          )}
                                        >
                                          {getAnswerFormatLabel(
                                            item.answerFormat,
                                          )}
                                        </span>
                                      ) : (
                                        requiredAnswerFormats.map((format) => (
                                          <span
                                            key={`${item.id}-${format}`}
                                            className={cn(
                                              "rounded-md px-2 py-1 text-[10px] font-medium shadow-sm",
                                              formatColorMap[format],
                                            )}
                                          >
                                            {getAnswerFormatLabel(format)}
                                          </span>
                                        ))
                                      )}

                                      <span
                                        className={cn(
                                          "rounded-md px-2 py-1 text-[10px] font-medium shadow-sm",
                                          visibilityColorMap[
                                            item.answerVisibility
                                          ],
                                        )}
                                      >
                                        {
                                          visibilityLabelMap[
                                            item.answerVisibility
                                          ]
                                        }
                                      </span>

                                      {questionChips.map((chip) => (
                                        <span
                                          key={`${item.id}-${chip}`}
                                          className="rounded-md border border-border/80 bg-background px-2 py-1 text-[10px] text-muted-foreground shadow-sm"
                                        >
                                          {chip}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2.5 pt-1">
                          <h2 className="text-[1.125rem] font-bold leading-snug text-foreground sm:line-clamp-none sm:text-[1.25rem]">
                            {item.title}
                          </h2>
                          {item.body ? (
                            <p className="line-clamp-3 text-[14.5px] leading-[1.45] text-muted-foreground/90 whitespace-pre-wrap [overflow-wrap:anywhere] md:line-clamp-1 md:text-[15px] md:leading-relaxed">
                              {item.body}
                            </p>
                          ) : null}
                        </div>

                        {item.images && item.images.length > 0 && (
                          <div className="flex max-w-full flex-wrap gap-2 overflow-hidden rounded-2xl">
                            {item.images.slice(0, 1).map((imgUrl, index) => (
                              <a
                                key={index}
                                href={imgUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="group block h-[132px] w-full overflow-hidden rounded-[14px] border border-border/70 bg-muted/10 sm:h-32 sm:w-32 md:h-36 md:w-36"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={imgUrl}
                                  alt={`Question media ${index + 1}`}
                                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                                />
                              </a>
                            ))}
                            {item.images.slice(1).map((imgUrl, index) => (
                              <a
                                key={`${imgUrl}-${index + 1}`}
                                href={imgUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="group block size-[58px] overflow-hidden rounded-[10px] border border-border/70 bg-muted/10"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={imgUrl}
                                  alt={`Question media ${index + 2}`}
                                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                                />
                              </a>
                            ))}
                          </div>
                        )}

                        {isAccepted && (
                          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3">
                            <p className="text-sm font-semibold text-foreground">
                              {item.acceptedByName
                                ? `${item.acceptedByName} is already working on this question.`
                                : "This question is currently being answered."}
                            </p>
                            {item.acceptedAt && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Accepted {formatTimeAgo(item.acceptedAt)}
                              </p>
                            )}
                          </div>
                        )}

                        {isSolved && (
                          <div className="overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05]">
                            <button
                              type="button"
                              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-emerald-500/[0.08]"
                              onClick={() =>
                                item.answer && toggleAnswer(item.id)
                              }
                            >
                              <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-foreground">
                                  Accepted answer
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {item.answer?.acceptorName ||
                                    item.acceptedByName ||
                                    "Teacher"}{" "}
                                  solved this question.
                                </p>
                              </div>
                              {item.answer ? (
                                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                                  <span>
                                    {expandedAnswers.has(item.id)
                                      ? "Hide"
                                      : "View"}
                                  </span>
                                  <ChevronDownIcon
                                    className={cn(
                                      "size-4 transition-transform duration-200",
                                      expandedAnswers.has(item.id) &&
                                        "rotate-180",
                                    )}
                                  />
                                </div>
                              ) : null}
                            </button>

                            {item.answer &&
                              expandedAnswers.has(item.id) &&
                              (() => {
                                const answer = item.answer;

                                return (
                                  <div className="space-y-4 border-t border-emerald-500/15 bg-background/95 px-4 py-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                      <div>
                                        {answer.acceptorId ? (
                                          <Link
                                            href={getProfilePath({
                                              id: answer.acceptorId,
                                              name: answer.acceptorName || "Teacher",
                                            })}
                                            className="text-sm font-semibold text-foreground transition-colors hover:text-primary hover:underline"
                                          >
                                            {answer.acceptorName || "Teacher"}
                                          </Link>
                                        ) : (
                                          <p className="text-sm font-semibold text-foreground">
                                            {answer.acceptorName || "Teacher"}
                                          </p>
                                        )}
                                        {answer.submittedAt && (
                                          <p className="text-xs text-muted-foreground">
                                            Posted{" "}
                                            {formatTimeAgo(answer.submittedAt)}
                                          </p>
                                        )}
                                      </div>

                                      {answer.rating != null && (
                                        <div className="flex items-center gap-0.5">
                                          {[1, 2, 3, 4, 5].map((star) => (
                                            <StarIcon
                                              key={star}
                                              className={cn(
                                                "size-3.5",
                                                star <=
                                                  Math.round(answer.rating ?? 0)
                                                  ? "fill-amber-400 text-amber-400"
                                                  : "text-muted-foreground/30",
                                              )}
                                            />
                                          ))}
                                          <span className="ml-1 text-xs text-muted-foreground">
                                            {Number(answer.rating).toFixed(1)}
                                          </span>
                                        </div>
                                      )}
                                    </div>

                                    {answer.content && (
                                      <p className="text-sm leading-7 text-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">
                                        {answer.content}
                                      </p>
                                    )}

                                    {answer.mediaUrls &&
                                      answer.mediaUrls.length > 0 && (
                                        <div
                                          className={cn(
                                            "grid gap-2 overflow-hidden rounded-2xl",
                                            answer.mediaUrls.length === 1
                                              ? "grid-cols-1"
                                              : "grid-cols-1 sm:grid-cols-2",
                                          )}
                                        >
                                          {answer.mediaUrls.map(
                                            (url, index) => {
                                              const isVideo =
                                                url.includes("/video/") ||
                                                url.endsWith(".mp4") ||
                                                url.endsWith(".webm");

                                              return isVideo ? (
                                                <video
                                                  key={index}
                                                  src={url}
                                                  controls
                                                  className="h-full max-h-80 w-full rounded-xl border border-border bg-muted/30"
                                                />
                                              ) : (
                                                <a
                                                  key={index}
                                                  href={url}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="group block overflow-hidden rounded-xl border border-border/70 bg-muted/10"
                                                >
                                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                                  <img
                                                    src={url}
                                                    alt={`Answer media ${index + 1}`}
                                                    className="h-32 w-full object-cover transition-transform duration-200 group-hover:scale-[1.02] sm:h-48"
                                                  />
                                                </a>
                                              );
                                            },
                                          )}
                                        </div>
                                      )}
                                  </div>
                                );
                              })()}
                          </div>
                        )}

                        {!isAccepted && !isSolved && (
                          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Answer lane
                            </p>
                            <p className="mt-1 text-sm font-medium text-foreground">
                              {item.previewAuthor || "No public answer yet"}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                              {item.previewText ||
                                (role === "TEACHER"
                                  ? "Accept this question and be the first to help with a clear answer."
                                  : "Waiting for a teacher to accept this question.")}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/[0.18] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center justify-between sm:justify-start sm:gap-2">
                          {/* Mobile reactions */}
                          <div className="flex items-center gap-3 md:hidden">
                            {REACTION_CONFIG.map(({ type, icon: Icon, label }) => {
                              const count = item.reactions.filter(
                                (r) => r.type === type,
                              ).length;
                              const isActive = userReaction?.type === type;
                              return (
                                <button
                                  key={type}
                                  type="button"
                                  aria-label={`${label} (${count})`}
                                  aria-pressed={isActive}
                                  onClick={() => handleReact(item.id, type)}
                                  className={cn(
                                    "flex items-center gap-1.5 text-xs font-medium transition-colors",
                                    isActive
                                      ? "text-primary"
                                      : "text-muted-foreground hover:text-foreground",
                                  )}
                                >
                                  <Icon
                                    className={cn(
                                      "size-4",
                                      isActive && "fill-current",
                                    )}
                                  />
                                  <span>{count}</span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Desktop reactions info */}
                          <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
                            <ThumbsUpIcon className="size-3.5" />
                            {totalReactions} reacts
                          </span>

                          <div className="flex items-center gap-3 sm:gap-2">
                            <button
                              type="button"
                              aria-label={`${item.commentCount} comments`}
                              aria-expanded={isExpandedComments}
                              onClick={() => toggleComments(item.id)}
                              className={cn(
                                "flex sm:inline-flex items-center gap-1.5 text-xs font-medium transition-colors sm:rounded-full sm:border sm:px-3 sm:py-1.5",
                                isExpandedComments
                                  ? "text-primary sm:border-primary/40 sm:bg-primary/10"
                                  : "text-muted-foreground hover:text-foreground sm:border-border sm:bg-background",
                              )}
                            >
                              <MessageSquareIcon className="size-4 sm:size-3.5" />
                              <span>{item.commentCount}</span>
                              <span className="hidden sm:inline">
                                {" "}
                                comments
                              </span>
                            </button>

                            <span className="flex sm:inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground sm:rounded-full sm:border sm:border-border sm:bg-background sm:px-3 sm:py-1.5">
                              <CheckCircle2Icon className="size-4 sm:size-3.5" />
                              <span>{item.answerCount}</span>
                              <span className="hidden sm:inline"> answers</span>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {canComment && (
                            <Button
                              onClick={() => toggleComments(item.id)}
                              size="sm"
                              variant={
                                isExpandedComments ? "secondary" : "outline"
                              }
                              className="hidden sm:flex"
                            >
                              <MessageSquareIcon className="mr-1 size-3.5" />
                              Comment
                            </Button>
                          )}

                          {canAccept && (
                            <Button
                              disabled={isAcceptLoading}
                              onClick={() => handleAccept(item.id)}
                              size="sm"
                              className="flex-1 sm:flex-none"
                            >
                              {isAcceptLoading ? (
                                <Loader2Icon className="mr-1 size-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2Icon className="mr-1 size-3.5" />
                              )}
                              Accept
                            </Button>
                          )}

                          {canOpenThread && (
                            <Button
                              asChild
                              size="sm"
                              variant="ghost"
                              className="flex-1 sm:flex-none justify-between sm:justify-center border border-border sm:border-transparent"
                            >
                              <Link href={getChannelPath(item.channelId)}>
                                Open thread
                                <ArrowUpRightIcon className="size-3.5" />
                              </Link>
                            </Button>
                          )}
                        </div>
                      </div>
                      {isExpandedComments && (
                        <div className="border-t border-border/60 bg-background px-4 py-4">
                          <div className="space-y-4">
                            <div className="max-h-[320px] space-y-4 overflow-y-auto pr-1">
                              {comments.length === 0 ? (
                                <p className="py-2 text-sm text-muted-foreground">
                                  No comments yet. The first reply will appear
                                  here.
                                </p>
                              ) : (
                                comments.map((comment) => (
                                  <div
                                    key={comment._id}
                                    className="flex min-w-0 gap-3"
                                  >
                                    {comment.studentId?.userImage ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={comment.studentId.userImage}
                                        alt={comment.studentId.name || "User"}
                                        className="size-8 rounded-full border border-border/60 object-cover shrink-0"
                                      />
                                    ) : (
                                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                        {(comment.studentId?.name || "U")
                                          .charAt(0)
                                          .toUpperCase()}
                                      </div>
                                    )}

                                    <div className="min-w-0 flex-1 border-l-2 border-border/60 pl-3">
                                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                        <span className="font-semibold text-foreground">
                                          {comment.studentId?.name ||
                                            "Anonymous"}
                                        </span>
                                        {comment.studentId?.username && (
                                          <span>
                                            @{comment.studentId.username}
                                          </span>
                                        )}
                                        <span>•</span>
                                        <span>
                                          {formatTimeAgo(comment.createdAt)}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-sm leading-6 text-foreground/90 whitespace-pre-wrap [overflow-wrap:anywhere]">
                                        {comment.content}
                                      </p>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>

                            {canComment && (
                              <div className="rounded-2xl border border-border/70 bg-muted/10 p-3">
                                <div className="relative">
                                  <textarea
                                    placeholder="Add a comment to this question..."
                                    className="min-h-[48px] w-full resize-none rounded-xl border border-border bg-background px-4 py-3 pr-12 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                                    rows={1}
                                    value={commentInput[item.id] || ""}
                                    onChange={(e) => {
                                      setCommentInput((prev) => ({
                                        ...prev,
                                        [item.id]: e.target.value,
                                      }));
                                      e.target.style.height = "auto";
                                      e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        submitComment(item.id);
                                      }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="absolute right-3 top-3 p-1 text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
                                    disabled={
                                      isSubmittingComment === item.id ||
                                      !commentInput[item.id]?.trim()
                                    }
                                    onClick={() => submitComment(item.id)}
                                  >
                                    {isSubmittingComment === item.id ? (
                                      <Loader2Icon className="size-4 animate-spin" />
                                    ) : (
                                      <SendIcon className="size-4" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="hidden space-y-6 md:block xl:hidden">
          {renderCourseHighlightsPanel()}
          {renderTopTeachersPanel()}
          {renderCommunityNotesPanel()}
        </div>

        <div id="top-teachers" className="hidden space-y-6 xl:block">
          <div className="space-y-6">
            <Card className="overflow-hidden border border-border/70 bg-background shadow-sm">
              <CardHeader className="border-b border-border/60 pb-4">
                <CardDescription>Courses</CardDescription>
                <CardTitle className="text-base">Course highlights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {courseHighlights.length > 0 ? (
                  <>
                    <div className="overflow-hidden rounded-2xl">
                      <div
                        className="flex transition-transform duration-500 ease-out"
                        style={{
                          transform: `translateX(-${activeCourseIndex * 100}%)`,
                        }}
                      >
                        {courseHighlights.map((course, index) => (
                          <div key={course.id} className="min-w-full">
                            <Link
                              href={`/courses/${course.slug}`}
                              className="block overflow-hidden rounded-2xl border border-border/70 bg-background transition-colors hover:border-primary/30"
                            >
                              <div
                                className={cn(
                                  "relative h-40 bg-gradient-to-br",
                                  COURSE_FALLBACK_GRADIENTS[
                                    index % COURSE_FALLBACK_GRADIENTS.length
                                  ],
                                )}
                              >
                                {course.thumbnailUrl ? (
                                  <>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={course.thumbnailUrl}
                                      alt={course.title}
                                      className="absolute inset-0 h-full w-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-slate-950/45" />
                                  </>
                                ) : null}
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.35),transparent_45%)]" />
                                <div className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-black/20 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                                  <BookOpenIcon className="size-3" />
                                  {course.subject}
                                </div>
                                <div className="absolute right-4 top-4 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                                  {formatCoursePrice(course)}
                                </div>
                                <div className="absolute inset-x-4 bottom-4">
                                  <p className="text-lg font-semibold text-white">
                                    {course.title}
                                  </p>
                                  <p className="mt-1 text-sm text-white/85">
                                    {course.level}
                                  </p>
                                </div>
                              </div>

                              <div className="space-y-3 p-4">
                                <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                                  {course.description ||
                                    "Structured lessons and guided practice from the course library."}
                                </p>
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>{course.lessonsCount} lessons</span>
                                  <span>{course.enrollmentCount} learners</span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>By {course.instructorName}</span>
                                  <span className="inline-flex items-center gap-1 font-medium text-primary">
                                    Open course
                                    <ArrowUpRightIcon className="size-3.5" />
                                  </span>
                                </div>
                              </div>
                            </Link>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {courseHighlights.map((course, index) => (
                          <button
                            key={course.id}
                            type="button"
                            onClick={() => setActiveCourseIndex(index)}
                            className={cn(
                              "size-2.5 rounded-full transition-colors",
                              index === activeCourseIndex
                                ? "bg-primary"
                                : "bg-border",
                            )}
                            aria-label={`Show course ${index + 1}`}
                          />
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setActiveCourseIndex((current) =>
                              current === 0
                                ? courseHighlights.length - 1
                                : current - 1,
                            )
                          }
                          className="inline-flex size-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Previous course"
                          disabled={courseHighlights.length <= 1}
                        >
                          <ChevronLeftIcon className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setActiveCourseIndex(
                              (current) =>
                                (current + 1) % courseHighlights.length,
                            )
                          }
                          className="inline-flex size-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Next course"
                          disabled={courseHighlights.length <= 1}
                        >
                          <ChevronRightIcon className="size-4" />
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 p-5">
                    <p className="text-sm font-medium text-foreground">
                      No active courses yet
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      As soon as courses are published, they will appear here
                      automatically.
                    </p>
                    <Button asChild size="sm" className="mt-4">
                      <Link href="/courses">Browse courses</Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {renderTopTeachersPanel()}

            {renderCommunityNotesPanel()}
          </div>
        </div>
      </div>

      {role === "TEACHER" ? (
        <Card className="hidden border border-border/70 bg-background shadow-sm xl:block">
          <CardContent className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Want to compare with the best?
              </p>
              <p className="text-sm text-muted-foreground">
                Jump to the top-rated teachers section and check the current top
                5.
              </p>
            </div>
            <Button asChild className="w-full sm:w-auto">
              <Link href="#top-teachers">See Top 5 Teachers</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
