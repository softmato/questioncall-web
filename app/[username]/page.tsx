import type { Metadata } from "next";

import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";

import {
  AwardIcon,
  BookOpenIcon,
  MessageSquareIcon,
  StarIcon,
  CoinsIcon,
  CalendarIcon,
  MailIcon,
  GraduationCapIcon,
  ActivityIcon,
} from "lucide-react";

import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import Question from "@/models/Question";
import Answer, { type AnswerRecord } from "@/models/Answer";
import WalletHistoryEvent from "@/models/WalletHistoryEvent";

import { GuestHeader } from "@/components/shared/guest-header";
import { WorkspaceShell } from "@/components/shared/workspace-shell";
import { ProfileQuestionsTab } from "@/components/shared/profile-questions-tab";
import { ActivityOverview } from "@/components/shared/activity-overview";
import { ActivityGraph } from "@/components/shared/activity-graph";
import { Button } from "@/components/ui/button";
import {
  getDefaultPath,
  getSafeServerSession,
  getWorkspaceUser,
} from "@/lib/auth";
import { formatPoints } from "@/lib/points";
import {
  getPlatformConfig,
  getPlatformSocialLinks,
} from "@/models/PlatformConfig";
import { getPublicUserByUsername } from "@/lib/user-directory";
import { APP_NAME } from "@/lib/constants";
import {
  getMessagesPath,
  getSettingsPath,
  getSignInPath,
  getUserHandle,
} from "@/lib/user-paths";
import { createNoIndexMetadata, createPageMetadata } from "@/lib/seo";

function formatJoinedDate(value?: Date | string) {
  if (!value) {
    return "Recently joined";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently joined";
  }

  return `Joined ${date.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
}

interface PopulatedQuestion {
  _id: mongoose.Types.ObjectId;
  title: string;
  body: string;
  status: string;
  answerVisibility?: string;
  reactions: string[];
  createdAt: Date;
  reactionCount?: number;
  answerId?: {
    _id: mongoose.Types.ObjectId;
    content?: string;
    mediaUrls?: string[];
  } | null;
}

function maskEmail(email: string) {
  const [localPart, domain] = email.split("@");

  if (!localPart || !domain) {
    return email;
  }

  const visibleLocal = localPart.slice(0, 2);
  return `${visibleLocal}${"*".repeat(Math.max(localPart.length - 2, 2))}@${domain}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;

  if (!/^[a-zA-Z0-9_-]{3,24}$/.test(username)) {
    return createNoIndexMetadata({
      title: "Profile",
      description: "Invalid public profile.",
    });
  }

  const profile = await getPublicUserByUsername(username);

  if (!profile) {
    return createNoIndexMetadata({
      title: "Profile not found",
      description: "The requested public profile could not be found.",
    });
  }

  const fallbackDescription =
    profile.role === "STUDENT"
      ? `${profile.name} is learning with ${APP_NAME} through questions, courses, and quizzes.`
      : `${profile.name} helps students learn on ${APP_NAME} through answers, teaching, and guided support.`;

  return createPageMetadata({
    title: `${profile.name} (@${profile.username})`,
    description: profile.bio?.trim() || fallbackDescription,
    path: `/${profile.username}`,
    image: profile.userImage,
    keywords: [profile.username, profile.name, APP_NAME].filter(Boolean),
  });
}

export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { username } = await params;
  const searchParamsObj = await searchParams;
  const tab =
    typeof searchParamsObj.tab === "string" ? searchParamsObj.tab : "overview";

  // Prevent hitting the database for obviously invalid or malformed usernames
  // (e.g., random bot spam, missing static files like favicon.ico, or random strings).
  // Usernames must be 3-24 characters containing only letters, numbers, hyphens, and underscores.
  if (!/^[a-zA-Z0-9_-]{3,24}$/.test(username)) {
    notFound();
  }

  const profile = await getPublicUserByUsername(username);

  if (!profile) {
    notFound();
  }

  const session = await getSafeServerSession();

  if (session?.user?.role === "ADMIN") {
    redirect(getDefaultPath(session.user.role));
  }

  const viewerHandle = session?.user ? getUserHandle(session.user) : null;
  const isOwner = viewerHandle === profile.username;
  // A teacher's detailed activity is their earnings and penalties; only they see it.
  const canSeeActivity = isOwner || profile.role === "STUDENT";

  await connectToDatabase();
  const isStudent = profile.role === "STUDENT";

  let featureQuestions = await Question.aggregate([
    {
      $match: {
        [isStudent ? "askerId" : "acceptedById"]: new mongoose.Types.ObjectId(
          profile.id,
        ),
      },
    },
    {
      $addFields: { reactionCount: { $size: { $ifNull: ["$reactions", []] } } },
    },
    { $sort: { reactionCount: -1, createdAt: -1 } },
    { $limit: 3 },
  ]);
  featureQuestions = await Question.populate(featureQuestions, {
    path: "answerId",
    model: Answer,
  });

  const latestQuestions = (
    await Question.find({
      [isStudent ? "askerId" : "acceptedById"]: new mongoose.Types.ObjectId(
        profile.id,
      ),
    })
      .populate({ path: "answerId", model: Answer })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean<PopulatedQuestion[]>()
  ).map(hidePrivateAnswer);
  featureQuestions = featureQuestions.map(hidePrivateAnswer);

  // A private answer is for the asker and the teacher only. The feed and the
  // public-profile API already drop it; this page is public, so it must too.
  function hidePrivateAnswer(question: PopulatedQuestion): PopulatedQuestion {
    return isOwner || question.answerVisibility === "PUBLIC"
      ? question
      : { ...question, answerId: null };
  }

  let totalMediaFiles = 0;
  const videoUrls: { url: string; questionId: string }[] = [];
  const photoUrls: { url: string; questionId: string }[] = [];

  if (!isStudent) {
    const mediaAnswers = await Answer.find({
      acceptorId: new mongoose.Types.ObjectId(profile.id),
      mediaUrls: { $exists: true, $not: { $size: 0 } },
      isPublic: true,
    })
      .populate("questionId")
      .sort({ createdAt: -1 })
      .lean();

    totalMediaFiles = mediaAnswers.reduce(
      (acc: number, a: AnswerRecord) => acc + (a.mediaUrls?.length || 0),
      0,
    );

    mediaAnswers.forEach(
      (
        ans: AnswerRecord & {
          questionId?: {
            _id: mongoose.Types.ObjectId;
            title: string;
            body: string;
          };
        },
      ) => {
        ans.mediaUrls?.forEach((url: string) => {
          const isVid =
            url.match(/\.(mp4|webm|ogg)$/i) || url.includes("video/upload");
          const qId =
            ans.questionId?._id?.toString() || ans.questionId?.toString();
          if (isVid) videoUrls.push({ url, questionId: qId });
          else photoUrls.push({ url, questionId: qId });
        });
      },
    );
  }

  // Heatmap Data Fetching
  const heatmapStartDate = new Date();
  heatmapStartDate.setDate(heatmapStartDate.getDate() - 365);
  
  let heatmapData: { date: string; amount: number }[] = [];
  if (isStudent) {
    const questionsAgg = await Question.aggregate([
      { $match: { askerId: new mongoose.Types.ObjectId(profile.id), createdAt: { $gte: heatmapStartDate } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, amount: { $sum: 1 } } }
    ]);
    heatmapData = questionsAgg.map(d => ({ date: d._id, amount: d.amount }));
  } else {
    const earningsAgg = await WalletHistoryEvent.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(profile.id), occurredAt: { $gte: heatmapStartDate } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$occurredAt" } }, amount: { $sum: { $cond: [{ $gt: ["$pointsDelta", 0] }, "$pointsDelta", 0] } } } }
    ]);
    heatmapData = earningsAgg.map(d => ({ date: d._id, amount: d.amount }));
  }

  const profileContent = (
    <div className="mx-auto w-full max-w-[1280px] px-4 md:px-8 py-8">
      <div className="grid gap-8 lg:grid-cols-[296px_minmax(0,1fr)] items-start">
        {/* LEFT SIDEBAR - GitHub Style Sticky */}
        <aside className="space-y-5 lg:sticky lg:top-[5.5rem]">
          {/* Avatar */}
          <div className="relative mx-auto aspect-square w-full max-w-[296px] overflow-hidden rounded-full border border-border bg-muted shadow-sm">
            {profile.userImage ? (
              <Image
                src={profile.userImage}
                alt={profile.name || ""}
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-primary text-6xl font-semibold text-primary-foreground drop-shadow-sm select-none">
                {(profile.name || profile.username).slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          {/* Name and Handle */}
          <div className="space-y-1 py-1">
            <h1 className="text-2xl font-bold leading-tight text-foreground">
              {profile.name}
            </h1>
            <h2 className="text-xl font-light text-muted-foreground">
              {profile.username}
            </h2>
          </div>

          {/* Action Button */}
          {session?.user ? (
            isOwner ? (
              <Button
                asChild
                className="w-full font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border"
                variant="secondary"
              >
                <Link href={getSettingsPath(session.user)}>Edit profile</Link>
              </Button>
            ) : (
              <Button
                asChild
                className="w-full font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border"
                variant="secondary"
              >
                <Link href={getMessagesPath(session.user)}>Message</Link>
              </Button>
            )
          ) : (
            <Button
              asChild
              className="w-full font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border"
              variant="secondary"
            >
              <Link href={getSignInPath()}>Follow</Link>
            </Button>
          )}

          <div className="text-sm leading-snug text-foreground whitespace-pre-wrap">
            {profile.bio ||
              (profile.role === "STUDENT"
                ? `Student at ${APP_NAME}. Learning and growing every day.`
                : "Platform Educator. Helping students understand core concepts.")}
          </div>

          <div className="flex items-center gap-2 text-sm text-foreground">
            <div className="flex items-center hover:text-primary cursor-pointer transition-colors">
              <span className="font-semibold text-foreground mr-1 flex items-center gap-1">
                {profile.role === "STUDENT" ? (
                  <CoinsIcon className="size-4 text-emerald-500" />
                ) : (
                  <MessageSquareIcon className="size-4" />
                )}
                {profile.role === "STUDENT"
                  ? formatPoints(profile.points)
                  : profile.totalAnswered}
              </span>
              <span className="text-muted-foreground ml-1">
                {profile.role === "STUDENT" ? "money" : "answers"}
              </span>
            </div>
            {profile.role === "TEACHER" && (
              <>
                <span>·</span>
                <div className="flex items-center hover:text-primary cursor-pointer transition-colors">
                  <span className="font-semibold text-foreground mr-1 flex items-center gap-1">
                    <StarIcon className="size-4 text-amber-500" />
                    {profile.overallScore.toFixed(1)}
                  </span>
                  <span className="text-muted-foreground ml-1">rating</span>
                </div>
              </>
            )}
          </div>

          <div className="space-y-3 border-t border-border pt-4 text-sm text-foreground">
            <div className="flex items-center gap-2">
              <CalendarIcon className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Joined</span>
              <span className="ml-auto font-medium">
                {formatJoinedDate(profile.createdAt)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <MailIcon className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Email</span>
              <span className="ml-auto truncate font-medium">
                {isOwner ? profile.email : maskEmail(profile.email)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <GraduationCapIcon className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Role</span>
              <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary capitalize">
                {profile.role.toLowerCase()}
                {profile.role === "TEACHER" && profile.teacherModeVerified && (
                  <span className="ml-1 text-[10px] uppercase font-bold text-emerald-500">
                    ✔ Verified
                  </span>
                )}
              </span>
            </div>

            {profile.role === "TEACHER" && (
              <div className="mt-4 border-t border-border pt-4">
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Teacher Rating
                </p>
                <div className="flex items-center gap-1 text-amber-500">
                  <StarIcon className="size-4 fill-amber-500" />
                  <StarIcon className="size-4 fill-amber-500" />
                  <StarIcon className="size-4 fill-amber-500" />
                  <StarIcon className="size-4 fill-amber-500" />
                  {profile.overallScore >= 4.5 ? (
                    <StarIcon className="size-4 fill-amber-500" />
                  ) : (
                    <StarIcon className="size-4 fill-amber-500/30 text-amber-500/30" />
                  )}
                  <span className="ml-2 font-medium text-foreground">
                    {profile.overallScore.toFixed(1)} / 5.0
                  </span>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* RIGHT CONTENT SIDE */}
        <div className="space-y-6 min-w-0">
          {/* GITHUB TABS */}
          <div className="sticky top-0 z-10 -mx-4 overflow-x-auto bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:mx-0 md:px-0">
            <nav className="flex gap-2 border-b border-border">
              <Link
                href={`/${profile.username}?tab=overview`}
                className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${tab === "overview" ? "border-primary text-primary bg-primary/5 rounded-t-md" : "border-transparent text-muted-foreground hover:border-muted-foreground hover:text-foreground"}`}
              >
                <BookOpenIcon
                  className={`size-4 ${tab === "overview" ? "text-primary" : "text-muted-foreground"}`}
                />
                Overview
              </Link>
              <Link
                href={`/${profile.username}?tab=questions`}
                className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${tab === "questions" ? "border-primary text-primary bg-primary/5 rounded-t-md" : "border-transparent text-muted-foreground hover:border-muted-foreground hover:text-foreground"}`}
              >
                <MessageSquareIcon
                  className={`size-4 ${tab === "questions" ? "text-primary" : "text-muted-foreground"}`}
                />
                {profile.role === "STUDENT"
                  ? "Questions Asked"
                  : "Solved Questions"}
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider ${tab === "questions" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
                >
                  {profile.role === "STUDENT"
                    ? profile.totalAsked || 0
                    : profile.totalAnswered}
                </span>
              </Link>
              {canSeeActivity && (
              <Link
                href={`/${profile.username}?tab=activity`}
                className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${tab === "activity" ? "border-primary text-primary bg-primary/5 rounded-t-md" : "border-transparent text-muted-foreground hover:border-muted-foreground hover:text-foreground"}`}
              >
                <ActivityIcon
                  className={`size-4 ${tab === "activity" ? "text-primary" : "text-muted-foreground"}`}
                />
                Activity
              </Link>
              )}
              {profile.role === "TEACHER" && (
                <Link
                  href={`/${profile.username}?tab=media`}
                  className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${tab === "media" ? "border-primary text-primary bg-primary/5 rounded-t-md" : "border-transparent text-muted-foreground hover:border-muted-foreground hover:text-foreground"}`}
                >
                  <AwardIcon
                    className={`size-4 ${tab === "media" ? "text-primary" : "text-muted-foreground"}`}
                  />
                  Media Answers
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider ${tab === "media" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
                  >
                    {totalMediaFiles}
                  </span>
                </Link>
              )}
            </nav>
          </div>

          {tab === "overview" ? (
            <>
              {/* README / OVERVIEW */}
              <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
                <p className="text-xs text-muted-foreground mb-4">
                  {profile.username} /{" "}
                  <span className="font-semibold text-foreground">
                    About.me
                  </span>
                </p>
                <div className="space-y-6">
                  <div className="prose prose-sm md:prose-base dark:prose-invert">
                    <h2 className="text-2xl font-bold border-b border-border pb-2 mb-4">
                      👋 Hi, I&apos;m {profile.name}
                    </h2>
                    <div className="text-muted-foreground leading-7 whitespace-pre-wrap">
                      {profile.bio ||
                        (profile.role === "STUDENT"
                          ? `I'm a student using ${APP_NAME} to clear my doubts and learn collaboratively. I actively participate in discussions and help peers when I can.`
                          : `I'm an educator dedicated to providing clear, concise, and highly visual explanations to student questions on ${APP_NAME}.`)}{" "}
                    </div>
                    <div className="mt-6">
                      <h3 className="font-semibold text-lg text-foreground mb-3">
                        Core Skills & Interests
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {profile.skills?.length ? (
                          profile.skills.map((tag: string) => (
                            <span
                              key={tag}
                              className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                            >
                              {tag}
                            </span>
                          ))
                        ) : (
                          <>
                            <span className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground">
                              Physics
                            </span>
                            <span className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground">
                              Calculus
                            </span>
                            <span className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground">
                              Computer Science
                            </span>
                          </>
                        )}
                      </div>

                      {profile.interests && profile.interests.length > 0 && (
                        <div className="mt-4">
                          <h4 className="font-medium text-sm text-muted-foreground mb-2">
                            Also interested in:
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {profile.interests.map((tag: string) => (
                              <span
                                key={tag}
                                className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ACTIVITY OVERVIEW */}
              <ActivityOverview data={heatmapData} role={profile.role as "STUDENT" | "TEACHER"} />

              {/* ACTIVITY GRID */}
              {featureQuestions.length > 0 && (
                <div>
                  <h3 className="mb-4 text-base font-semibold text-foreground">
                    Featured Activity
                  </h3>
                  <div className="flex flex-col gap-4">
                    {featureQuestions.map((item: PopulatedQuestion) => (
                      <details
                        key={item._id.toString()}
                        className="group rounded-lg border border-border bg-card shadow-sm transition hover:border-muted-foreground/50 overflow-hidden"
                      >
                        <summary className="flex cursor-pointer items-start justify-between p-5 list-none [&::-webkit-details-marker]:hidden focus:outline-none">
                          <div className="min-w-0 pr-4 flex-1">
                            <h4 className="flex items-center gap-2 font-semibold text-primary hover:underline line-clamp-1 mb-1">
                              <BookOpenIcon className="size-4 shrink-0" />
                              <Link href={`/question/${item._id}`}>
                                {item.title}
                              </Link>
                            </h4>
                            <p className="mt-2 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                              {item.body}
                            </p>
                            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                              <div className="flex items-center gap-3">
                                <span className="flex items-center gap-1.5">
                                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500"></span>
                                  {profile.role === "STUDENT"
                                    ? "Question"
                                    : "Solution"}
                                </span>
                                <span className="flex items-center gap-1 hover:text-foreground">
                                  <StarIcon className="size-3" />
                                  {item.reactionCount || 0}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors group-hover:bg-muted group-open:bg-primary group-open:text-primary-foreground group-open:border-primary">
                              <span className="group-open:hidden">
                                Show Answer
                              </span>
                              <span className="hidden group-open:inline">
                                Hide Answer
                              </span>
                            </span>
                          </div>
                        </summary>
                        <div className="border-t border-border bg-muted/20 p-5 text-sm text-foreground">
                          {item.answerId ? (
                            <div>
                              {item.answerId.content && (
                                <div className="whitespace-pre-wrap">
                                  {item.answerId.content}
                                </div>
                              )}
                              {item.answerId.mediaUrls &&
                                item.answerId.mediaUrls.length > 0 && (
                                  <div className="mt-4 flex flex-col gap-3">
                                    {item.answerId.mediaUrls.map(
                                      (url: string, i: number) => {
                                        const isVideo =
                                          url.match(/\.(mp4|webm|ogg)$/i) ||
                                          url.includes("video/upload");
                                        return (
                                          <div
                                            key={i}
                                            className="flex flex-col gap-2"
                                          >
                                            {isVideo ? (
                                              <video
                                                src={url}
                                                controls
                                                className="rounded-md max-w-full h-auto border border-border shadow-sm object-contain max-h-[300px]"
                                              />
                                            ) : (
                                              <Image
                                                src={url}
                                                alt="Answer Media"
                                                className="rounded-md max-w-full h-auto border border-border shadow-sm object-contain max-h-[300px]"
                                                width={400}
                                                height={300}
                                              />
                                            )}
                                          </div>
                                        );
                                      },
                                    )}
                                  </div>
                                )}
                              {!item.answerId.content &&
                                (!item.answerId.mediaUrls ||
                                  item.answerId.mediaUrls.length === 0) && (
                                  <p className="text-muted-foreground italic">
                                    Answer content is empty.
                                  </p>
                                )}
                            </div>
                          ) : (
                            <p className="text-muted-foreground italic">
                              No public answer available for this question.
                            </p>
                          )}
                          <div className="mt-4">
                            <Link
                              href={`/question/${item._id}`}
                              className="text-primary hover:underline text-xs font-medium"
                            >
                              View full thread →
                            </Link>
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : tab === "questions" ? (
            <ProfileQuestionsTab
              questions={latestQuestions.map((q: PopulatedQuestion) => ({
                _id: q._id.toString(),
                title: q.title,
                body: q.body,
                status: q.status,
                createdAt: q.createdAt.toString(),
                answerId: q.answerId
                  ? {
                      content: q.answerId.content,
                      mediaUrls: q.answerId.mediaUrls,
                    }
                  : null,
              }))}
              currentUserId={session?.user?.id}
              username={profile.username}
              totalCount={
                profile.role === "STUDENT"
                  ? profile.totalAsked || 0
                  : profile.totalAnswered || 0
              }
            />
          ) : tab === "media" && profile.role === "TEACHER" ? (
            <div className="space-y-8">
              {videoUrls.length > 0 && (
                <div>
                  <h3 className="mb-4 text-base font-semibold text-foreground border-b border-border pb-2">
                    Videos
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {videoUrls.map((item, i) => (
                      <Link
                        href={`/question/${item.questionId}`}
                        key={`vid-${i}`}
                        className="block group relative aspect-video bg-muted rounded-lg overflow-hidden border border-border shadow-sm"
                      >
                        <video
                          src={item.url}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {photoUrls.length > 0 && (
                <div>
                  <h3 className="mb-4 text-base font-semibold text-foreground border-b border-border pb-2">
                    Photos
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {photoUrls.map((item, i) => (
                      <Link
                        href={`/question/${item.questionId}`}
                        key={`img-${i}`}
                        className="block group relative aspect-square bg-muted rounded-lg overflow-hidden border border-border shadow-sm"
                      >
                        <Image
                          src={item.url}
                          alt=""
                          fill
                          className="object-cover group-hover:scale-105 transition duration-300"
                        />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {videoUrls.length === 0 && photoUrls.length === 0 && (
                <div className="rounded-lg border border-border border-dashed p-8 text-center text-muted-foreground shadow-sm">
                  <p>No media answers found.</p>
                </div>
              )}
            </div>
          ) : tab === "activity" && canSeeActivity ? (
            <ActivityGraph userId={profile.id} role={profile.role as "STUDENT" | "TEACHER"} isOwner={isOwner} />
          ) : null}
        </div>
      </div>
    </div>
  );

  if (session?.user) {
    const cookieStore = await cookies();
    const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
    const workspaceUser = await getWorkspaceUser(session.user);
    const config = await getPlatformConfig();
    const socialLinks = getPlatformSocialLinks(config);
    const dailyTargets: { target: number; bonus: number }[] = JSON.parse(
      JSON.stringify((config as any).dailyTargets ?? []),
    );

    return (
      <WorkspaceShell
        user={workspaceUser}
        socialLinks={socialLinks}
        dailyTargets={dailyTargets}
        defaultOpen={defaultOpen}
      >
        {profileContent}
      </WorkspaceShell>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <GuestHeader portalLabel="Public profile browser" />
      <main className="px-4 py-8 sm:px-6 lg:px-8">{profileContent}</main>
    </div>
  );
}
