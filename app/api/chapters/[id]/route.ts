import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import Mux from "@mux/mux-node";

import { connectToDatabase } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/unified-auth";
import Chapter from "@/models/Chapter";
import ChapterContent from "@/models/ChapterContent";
import ChapterEnrollment from "@/models/ChapterEnrollment";
import { normalizeDurationPayload } from "@/lib/duration";

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID || "demo",
  tokenSecret: process.env.MUX_TOKEN_SECRET || "demo",
});

const CHAPTER_PRICING_MODELS = ["FREE", "SUBSCRIPTION_INCLUDED", "PAID"] as const;
const CHAPTER_STATUSES = ["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"] as const;

export const dynamic = "force-dynamic";

function parsePrice(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);
    const authenticatedUserId = authenticatedUser?.id ?? null;

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid chapter id." }, { status: 400 });
    }

    await connectToDatabase();

    const chapter = await Chapter.findById(id).lean();
    if (!chapter) {
      return NextResponse.json({ error: "Chapter not found." }, { status: 404 });
    }

    const isAdmin = authenticatedUser?.role === "ADMIN";
    const isInstructor =
      Boolean(authenticatedUserId) &&
      chapter.instructorId.toString() === authenticatedUserId;

    if (!isAdmin && !isInstructor && chapter.status !== "ACTIVE") {
      return NextResponse.json({ error: "Chapter not found." }, { status: 404 });
    }

    const [contents, enrollment] = await Promise.all([
      ChapterContent.find({ chapterId: chapter._id })
        .select(
          "_id type title description order durationMinutes status thumbnailUrl fileName fileType fileSizeBytes viewCount",
        )
        .sort({ order: 1 })
        .lean(),
      authenticatedUser?.role === "STUDENT" && authenticatedUserId
        ? ChapterEnrollment.findOne({
            chapterId: chapter._id,
            studentId: authenticatedUserId,
          })
            .select("overallProgressPercent accessType")
            .lean()
        : Promise.resolve(null),
    ]);

    return NextResponse.json(normalizeDurationPayload({
          ...chapter,
          contents,
          ...(authenticatedUser?.role === "STUDENT" && enrollment
            ? {
                overallProgressPercent: enrollment.overallProgressPercent ?? 0,
                accessType: enrollment.accessType,
              }
            : {}),
        }));
  } catch (error) {
    console.error("[GET /api/chapters/:id]", error);
    return NextResponse.json({ error: "Failed to load chapter." }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);

    if (!authenticatedUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (authenticatedUser.role !== "TEACHER" && authenticatedUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only teachers or admins can update chapters." },
        { status: 403 },
      );
    }

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid chapter id." }, { status: 400 });
    }

    await connectToDatabase();

    const chapter = await Chapter.findById(id);
    if (!chapter) {
      return NextResponse.json({ error: "Chapter not found." }, { status: 404 });
    }

    const isAdmin = authenticatedUser.role === "ADMIN";
    const isInstructor = chapter.instructorId.toString() === authenticatedUser.id;
    if (!isAdmin && !isInstructor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (!title) {
        return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
      }
      chapter.title = title;
    }

    if (typeof body.description === "string") {
      const description = body.description.trim();
      if (!description) {
        return NextResponse.json(
          { error: "Description cannot be empty." },
          { status: 400 },
        );
      }
      chapter.description = description;
    }

    if (typeof body.subject === "string" && body.subject.trim()) {
      chapter.subject = body.subject.trim();
    }

    if (typeof body.level === "string" && body.level.trim()) {
      chapter.level = body.level.trim();
    }

    if (typeof body.pricingModel === "string") {
      const pricingModel = body.pricingModel.trim();
      if (
        !CHAPTER_PRICING_MODELS.includes(
          pricingModel as (typeof CHAPTER_PRICING_MODELS)[number],
        )
      ) {
        return NextResponse.json({ error: "Invalid pricing model." }, { status: 400 });
      }
      chapter.pricingModel = pricingModel;
    }

    if ("price" in body) {
      const price = parsePrice(body.price);
      if (price !== null && !Number.isFinite(price)) {
        return NextResponse.json({ error: "Invalid price." }, { status: 400 });
      }
      chapter.price = price;
    }

    if ("freePreviewCount" in body) {
      const parsedPreview =
        typeof body.freePreviewCount === "number"
          ? body.freePreviewCount
          : Number(body.freePreviewCount);
      if (!Number.isInteger(parsedPreview) || parsedPreview < 0) {
        return NextResponse.json(
          { error: "Free preview count must be a non-negative whole number." },
          { status: 400 },
        );
      }
      chapter.freePreviewCount = parsedPreview;
    }

    if (typeof body.status === "string") {
      const status = body.status.trim();
      if (!CHAPTER_STATUSES.includes(status as (typeof CHAPTER_STATUSES)[number])) {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      chapter.status = status;
    }

    if (typeof body.isFeatured === "boolean") {
      chapter.isFeatured = body.isFeatured;
    }

    if (body.thumbnailUrl === null) {
      chapter.thumbnailUrl = null;
    } else if (typeof body.thumbnailUrl === "string") {
      chapter.thumbnailUrl = body.thumbnailUrl.trim() || null;
    }

    if ("tags" in body) {
      chapter.tags = normalizeTags(body.tags);
    }

    if (chapter.pricingModel !== "PAID") {
      chapter.price = null;
    }

    await chapter.save();

    return NextResponse.json(normalizeDurationPayload(chapter));
  } catch (error) {
    console.error("[PATCH /api/chapters/:id]", error);

    if (error instanceof Error && error.name === "ValidationError") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to update chapter." }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);

    if (!authenticatedUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (authenticatedUser.role !== "TEACHER" && authenticatedUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only teachers or admins can delete chapters." },
        { status: 403 },
      );
    }

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid chapter id." }, { status: 400 });
    }

    await connectToDatabase();

    const chapter = await Chapter.findById(id);
    if (!chapter) {
      return NextResponse.json({ error: "Chapter not found." }, { status: 404 });
    }

    const isAdmin = authenticatedUser.role === "ADMIN";
    const isInstructor = chapter.instructorId.toString() === authenticatedUser.id;
    if (!isAdmin && !isInstructor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Best-effort: release Mux assets for any uploaded videos. Doc files in R2
    // are left to lifecycle cleanup.
    const videoContents = await ChapterContent.find({
      chapterId: chapter._id,
      type: "VIDEO",
    })
      .select("_id muxAssetId")
      .lean();

    await Promise.all(
      videoContents.map((content) =>
        content.muxAssetId
          ? mux.video.assets
              .delete(content.muxAssetId)
              .catch((error) =>
                console.error("[Mux chapter content cleanup]", {
                  contentId: content._id,
                  error,
                }),
              )
          : Promise.resolve(),
      ),
    );

    await ChapterEnrollment.deleteMany({ chapterId: chapter._id });
    await ChapterContent.deleteMany({ chapterId: chapter._id });
    await Chapter.deleteOne({ _id: chapter._id });

    return NextResponse.json(normalizeDurationPayload({ deleted: true, chapterId: chapter._id.toString() }));
  } catch (error) {
    console.error("[DELETE /api/chapters/:id]", error);
    return NextResponse.json({ error: "Failed to delete chapter." }, { status: 500 });
  }
}
