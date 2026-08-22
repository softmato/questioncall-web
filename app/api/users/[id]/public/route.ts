import { NextResponse, after } from "next/server";
import { Types } from "mongoose";

import { connectToDatabase } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/unified-auth";
import { getUserHandle } from "@/lib/user-paths";
import { notifyUser } from "@/lib/notifications/notify-user";
import User from "@/models/User";
import Question from "@/models/Question";
import Answer from "@/models/Answer";
import Course from "@/models/Course";
import ProfileView from "@/models/ProfileView";
import { questionSummary } from "@/lib/question-summary";

export const dynamic = "force-dynamic";

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

function isVideoUrl(url: string) {
  return (
    /\.(mp4|webm|ogg|mov|m3u8)(\?|$)/i.test(url) || url.includes("video/upload")
  );
}

type RouteParams = { params: Promise<{ id: string }> };

// Public profile showcase for the mobile app — tapping a username in the feed
// lands here. Keyed by userId (the feed always carries askerId) so it works
// even when a username isn't populated. Returns the user's public details plus
// the questions they've posted to the feed, in one round-trip.
export async function GET(request: Request, context: RouteParams) {
  try {
    const viewer = await getAuthenticatedUser(request);
    if (!viewer?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const limitParam = Number.parseInt(searchParams.get("limit") || "", 10);
    const offsetParam = Number.parseInt(searchParams.get("offset") || "", 10);
    const limit =
      Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 30
        ? limitParam
        : 15;
    const offset =
      Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : 0;

    await connectToDatabase();

    // Ensure Answer schema is registered before populate.
    void Answer;
    void Course;

    const user = await User.findById(id)
      .select(
        "name username role userImage bio skills interests points totalAnswered totalAsked questionsAsked overallRatingSum overallRatingCount overallScore teacherModeVerified createdAt lastActiveAt isSuspended favouriteCourses following",
      )
      .lean();

    if (!user || (user as { isSuspended?: boolean }).isSuspended) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const u = user as Record<string, unknown>;
    const ratingCount = (u.overallRatingCount as number) ?? 0;
    const ratingSum = (u.overallRatingSum as number) ?? 0;
    const averageRating =
      ratingCount > 0
        ? Number((ratingSum / ratingCount).toFixed(1))
        : ((u.overallScore as number) ?? 0);

    const lastActiveAt = u.lastActiveAt
      ? new Date(u.lastActiveAt as Date)
      : null;
    const isOnline = lastActiveAt
      ? Date.now() - lastActiveAt.getTime() < ONLINE_THRESHOLD_MS
      : false;

    const profile = {
      id,
      name: (u.name as string) || "User",
      username: getUserHandle({
        id,
        name: u.name as string,
        username: u.username as string | undefined,
      }),
      role: u.role as string,
      userImage: (u.userImage as string) || null,
      bio: (u.bio as string) || null,
      skills: Array.isArray(u.skills) ? (u.skills as string[]) : [],
      interests: Array.isArray(u.interests) ? (u.interests as string[]) : [],
      points: (u.points as number) ?? 0,
      totalAnswered: (u.totalAnswered as number) ?? 0,
      totalAsked: Math.max(
        (u.totalAsked as number) ?? 0,
        (u.questionsAsked as number) ?? 0,
      ),
      averageRating,
      ratingCount,
      teacherModeVerified: Boolean(u.teacherModeVerified),
      joinedAt: u.createdAt
        ? new Date(u.createdAt as Date).toISOString()
        : null,
      lastActiveAt: lastActiveAt ? lastActiveAt.toISOString() : null,
      isOnline,
    };

    const userObjectId = new Types.ObjectId(id);
    const isTeacher = profile.role === "TEACHER";
    const [followerCount, viewerFollowRecord] = await Promise.all([
      User.countDocuments({
        following: userObjectId,
      }),
      isTeacher && viewer.id !== id
        ? User.exists({ _id: viewer.id, following: userObjectId })
        : Promise.resolve(null),
    ]);
    const followingCount = Array.isArray(u.following) ? u.following.length : 0;

    const favouriteCourseIds = Array.isArray(u.favouriteCourses)
      ? (u.favouriteCourses as Types.ObjectId[])
      : [];
    const favouriteCourses =
      profile.role === "STUDENT" && favouriteCourseIds.length > 0
        ? await Course.find({
            _id: { $in: favouriteCourseIds },
            status: "ACTIVE",
          })
            .select(
              "title slug description subject level pricingModel thumbnailUrl instructorName totalDurationMinutes enrollmentCount",
            )
            .limit(12)
            .lean()
        : [];

    const mediaAnswers = isTeacher
      ? await Answer.find({
          acceptorId: userObjectId,
          mediaUrls: { $exists: true, $not: { $size: 0 } },
          isPublic: true,
        })
          .populate("questionId", "title")
          .sort({ createdAt: -1 })
          .limit(24)
          .lean()
      : [];

    const mediaAssets = mediaAnswers.flatMap((answer) => {
      const question = answer.questionId as unknown as
        | { _id?: Types.ObjectId; title?: string }
        | undefined;

      return (
        Array.isArray(answer.mediaUrls) ? (answer.mediaUrls as string[]) : []
      ).map((url) => ({
        url,
        type: isVideoUrl(url) ? "video" : "image",
        questionId:
          question?._id?.toString() ?? String(answer.questionId ?? ""),
        questionTitle: questionSummary(question ?? {}, 80, "Answered question"),
      }));
    });

    // Match the web profile: students show asked questions, teachers show solved
    // questions they answered.
    const questions = await Question.find({
      [isTeacher ? "acceptedById" : "askerId"]: userObjectId,
    })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .populate("answerId")
      .lean();

    const posts = questions.map((q) => {
      const linkedAnswer = q.answerId as unknown as {
        content?: string;
        mediaUrls?: string[];
        rating?: number | null;
      } | null;
      const isPublicSolved =
        q.status === "SOLVED" &&
        q.answerVisibility === "PUBLIC" &&
        linkedAnswer;
      return {
        id: q._id.toString(),
        title: q.title,
        body: q.body,
        images: Array.isArray(q.images) ? q.images : [],
        status: q.status,
        subject: q.subject || undefined,
        level: q.level || undefined,
        createdAt: new Date(q.createdAt).toISOString(),
        answer: isPublicSolved
          ? {
              content: linkedAnswer?.content,
              mediaUrls: Array.isArray(linkedAnswer?.mediaUrls)
                ? linkedAnswer?.mediaUrls
                : [],
              rating: linkedAnswer?.rating ?? null,
            }
          : null,
      };
    });

    // Track profile view and notify the owner (TikTok-style 3-day window).
    // Runs after the response is flushed via after() so it can't add latency
    // and is still guaranteed to run on serverless (unlike a bare promise).
    if (viewer.id !== id) {
      after(async () => {
        try {
          // Atomic upsert — race-free. upsertedCount > 0 means this is the
          // first view inside the 3-day TTL window (so we notify exactly once);
          // an existing record just gets its viewedAt refreshed (TTL resets).
          const result = await ProfileView.updateOne(
            { viewerId: viewer.id, viewedId: id },
            { $set: { viewedAt: new Date() } },
            { upsert: true },
          );

          if (result.upsertedCount && result.upsertedCount > 0) {
            await notifyUser({
              userId: id,
              type: "PROFILE_VIEWED",
              message: `${viewer.name} viewed your profile`,
              href: `/user/${viewer.id}`,
            });
          }
        } catch (err) {
          console.error("[GET /api/users/[id]/public] profile view tracking failed", err);
        }
      });
    }

    return NextResponse.json({
      profile: {
        ...profile,
        followerCount,
        followingCount,
        isFollowing: Boolean(viewerFollowRecord),
        favouriteCount: favouriteCourseIds.length,
        uploadedAssetCount: mediaAssets.length,
      },
      favouriteCourses: favouriteCourses.map((course) => ({
        id: course._id.toString(),
        title: course.title,
        slug: course.slug,
        description: course.description,
        subject: course.subject,
        level: course.level,
        pricingModel: course.pricingModel,
        thumbnailUrl: course.thumbnailUrl ?? null,
        instructorName: course.instructorName,
        totalDurationMinutes: course.totalDurationMinutes ?? null,
        enrollmentCount: course.enrollmentCount ?? 0,
      })),
      mediaAssets,
      posts,
      hasMore: questions.length === limit,
    });
  } catch (error) {
    console.error("[GET /api/users/[id]/public]", error);
    return NextResponse.json(
      { error: "Failed to load profile" },
      { status: 500 },
    );
  }
}
