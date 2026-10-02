import { NextRequest, NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/unified-auth";
import Chapter from "@/models/Chapter";
import ChapterEnrollment from "@/models/ChapterEnrollment";
import User from "@/models/User";
import { normalizeDurationPayload } from "@/lib/duration";

const CHAPTER_PRICING_MODELS = ["FREE", "SUBSCRIPTION_INCLUDED", "PAID"] as const;
const CHAPTER_CREATE_STATUSES = ["DRAFT", "ACTIVE"] as const;

export const dynamic = "force-dynamic";

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function parseBooleanFilter(value: string | null) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function parsePrice(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function GET(request: NextRequest) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);
    const authenticatedUserId = authenticatedUser?.id ?? null;

    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const page = parsePositiveInt(searchParams.get("page"), 1, 1000);
    const limit = parsePositiveInt(searchParams.get("limit"), 20, 50);
    const pricingModel = searchParams.get("pricingModel")?.trim();
    const subject = searchParams.get("subject")?.trim();
    const level = searchParams.get("level")?.trim();
    const featured = parseBooleanFilter(searchParams.get("featured"));

    const query: Record<string, unknown> = {};

    if (authenticatedUser?.role !== "ADMIN") {
      query.status = "ACTIVE";
    }

    if (
      pricingModel &&
      CHAPTER_PRICING_MODELS.includes(
        pricingModel as (typeof CHAPTER_PRICING_MODELS)[number],
      )
    ) {
      query.pricingModel = pricingModel;
    }
    if (subject) query.subject = subject;
    if (level) query.level = level;
    if (featured !== null) query.isFeatured = featured;

    const instructorFilter = searchParams.get("instructor")?.trim();
    if (
      instructorFilter === "me" &&
      authenticatedUser?.id &&
      (authenticatedUser.role === "TEACHER" || authenticatedUser.role === "ADMIN")
    ) {
      query.instructorId = authenticatedUser.id;
      delete query.status;
    }

    const [total, chapters] = await Promise.all([
      Chapter.countDocuments(query),
      Chapter.find(query)
        .select(
          "_id slug title subject level pricingModel price currency status isFeatured thumbnailUrl totalDurationMinutes enrollmentCount instructorName instructorRole freePreviewCount",
        )
        .sort({ isFeatured: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const progressByChapterId = new Map<string, number>();

    if (
      authenticatedUser?.role === "STUDENT" &&
      authenticatedUserId &&
      chapters.length > 0
    ) {
      const enrollments = await ChapterEnrollment.find({
        studentId: authenticatedUserId,
        chapterId: { $in: chapters.map((chapter) => chapter._id) },
      })
        .select("chapterId overallProgressPercent")
        .lean();

      enrollments.forEach((enrollment) => {
        progressByChapterId.set(
          enrollment.chapterId.toString(),
          enrollment.overallProgressPercent ?? 0,
        );
      });
    }

    const responseChapters = chapters.map((chapter) => {
      const overallProgressPercent = progressByChapterId.get(chapter._id.toString());
      return {
        ...chapter,
        ...(typeof overallProgressPercent === "number"
          ? { overallProgressPercent }
          : {}),
      };
    });

    return NextResponse.json(normalizeDurationPayload({
          chapters: responseChapters,
          pagination: {
            page,
            limit,
            total,
            totalPages: total > 0 ? Math.ceil(total / limit) : 0,
          },
        }));
  } catch (error) {
    console.error("[GET /api/chapters]", error);
    return NextResponse.json({ error: "Failed to load chapters." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);

    if (!authenticatedUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (authenticatedUser.role !== "TEACHER" && authenticatedUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only teachers or admins can create chapters." },
        { status: 403 },
      );
    }

    await connectToDatabase();

    const body = (await request.json()) as Record<string, unknown>;

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const level = typeof body.level === "string" ? body.level.trim() : "";
    const pricingModel =
      typeof body.pricingModel === "string" ? body.pricingModel.trim() : "";
    const price = parsePrice(body.price);
    const requestedStatus =
      typeof body.status === "string" ? body.status.trim() : "DRAFT";
    const thumbnailUrl = normalizeOptionalString(body.thumbnailUrl);

    if (!title || !description) {
      return NextResponse.json(
        { error: "Title and description are required." },
        { status: 400 },
      );
    }

    const validPricingModel = (pricingModel || "FREE") as
      | "FREE"
      | "SUBSCRIPTION_INCLUDED"
      | "PAID";
    if (!CHAPTER_PRICING_MODELS.includes(validPricingModel)) {
      return NextResponse.json({ error: "Invalid pricing model." }, { status: 400 });
    }

    if (
      validPricingModel === "PAID" &&
      (!Number.isFinite(price) || price === null || price <= 0)
    ) {
      return NextResponse.json(
        { error: "Paid chapters must have a positive price." },
        { status: 400 },
      );
    }

    const normalizedStatus = CHAPTER_CREATE_STATUSES.includes(
      requestedStatus as (typeof CHAPTER_CREATE_STATUSES)[number],
    )
      ? requestedStatus
      : "DRAFT";

    const dbUser = await User.findById(authenticatedUser.id)
      .select("name role")
      .lean<{ name?: string; role?: string } | null>();

    if (!dbUser?.name || (dbUser.role !== "TEACHER" && dbUser.role !== "ADMIN")) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const chapter = await Chapter.create({
      title,
      description,
      subject: subject || "General",
      level: level || "All Levels",
      pricingModel: validPricingModel,
      price: validPricingModel === "PAID" ? price : null,
      tags: normalizeTags(body.tags),
      thumbnailUrl,
      instructorId: authenticatedUser.id,
      instructorName: dbUser.name,
      instructorRole: dbUser.role,
      status: normalizedStatus,
    });

    return NextResponse.json(normalizeDurationPayload(chapter), { status: 201 });
  } catch (error) {
    console.error("[POST /api/chapters]", error);

    if (error instanceof Error && error.name === "ValidationError") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to create chapter." }, { status: 500 });
  }
}
