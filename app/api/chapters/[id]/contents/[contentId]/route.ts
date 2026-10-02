import { sumDurationMinutes } from "@/lib/duration";
import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import Mux from "@mux/mux-node";

import {
  checkChapterAccess,
  getChapterFreePreviewContentIds,
} from "@/lib/chapter-access";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/unified-auth";
import Chapter from "@/models/Chapter";
import ChapterContent from "@/models/ChapterContent";

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID || "demo",
  tokenSecret: process.env.MUX_TOKEN_SECRET || "demo",
});

function clampOrder(value: number, totalItems: number) {
  return Math.max(1, Math.min(totalItems, value));
}

async function resequenceContents(chapterId: string) {
  const contents = await ChapterContent.find({ chapterId }).sort({ order: 1 });
  if (contents.length === 0) return;

  await ChapterContent.bulkWrite(
    contents.map((content, index) => ({
      updateOne: {
        filter: { _id: content._id },
        update: { $set: { order: index + 1 } },
      },
    })),
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contentId: string }> },
) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);
    if (!authenticatedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, contentId } = await params;
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(contentId)) {
      return NextResponse.json(
        { error: "Invalid chapter or content id." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const content = await ChapterContent.findOne({ _id: contentId, chapterId: id });
    if (!content) {
      return NextResponse.json({ error: "Content not found." }, { status: 404 });
    }

    const canAccess = await checkChapterAccess(authenticatedUser.id, id);
    let isPreview = false;
    if (!canAccess) {
      const previewIds = await getChapterFreePreviewContentIds(id);
      isPreview = previewIds.has(contentId);
      if (!isPreview) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    void ChapterContent.findByIdAndUpdate(content._id, {
      $inc: { viewCount: 1 },
    }).catch((error) => console.error("[ChapterContent viewCount]", error));

    const plain = content.toObject ? content.toObject() : { ...content };
    const playbackUrl =
      content.type === "VIDEO"
        ? content.muxPlaybackId
          ? `https://stream.mux.com/${content.muxPlaybackId}.m3u8`
          : content.videoUrl ?? null
        : null;

    return NextResponse.json({ ...plain, playbackUrl, isPreview });
  } catch (error) {
    console.error("[GET /api/chapters/:id/contents/:contentId]", error);
    return NextResponse.json(
      { error: "Failed to load chapter content." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contentId: string }> },
) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);
    if (!authenticatedUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (authenticatedUser.role !== "TEACHER" && authenticatedUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only teachers or admins can update content." },
        { status: 403 },
      );
    }

    const { id, contentId } = await params;
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(contentId)) {
      return NextResponse.json(
        { error: "Invalid chapter or content id." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const [chapter, content] = await Promise.all([
      Chapter.findById(id),
      ChapterContent.findOne({ _id: contentId, chapterId: id }),
    ]);

    if (!chapter || !content) {
      return NextResponse.json({ error: "Content not found." }, { status: 404 });
    }

    if (
      authenticatedUser.role !== "ADMIN" &&
      chapter.instructorId.toString() !== authenticatedUser.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (!title) {
        return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
      }
      content.title = title;
    }

    if (body.description === null) {
      content.description = null;
    } else if (typeof body.description === "string") {
      content.description = body.description.trim() || null;
    }

    const parsedOrder =
      body.order === undefined ? null : Number.parseInt(String(body.order), 10);

    if (Number.isFinite(parsedOrder) && parsedOrder !== null && parsedOrder > 0) {
      const siblings = await ChapterContent.find({ chapterId: id }).sort({ order: 1 });
      const others = siblings.filter(
        (sibling) => sibling._id.toString() !== content._id.toString(),
      );
      const targetOrder = clampOrder(parsedOrder, siblings.length);
      const reordered = [...others];
      reordered.splice(targetOrder - 1, 0, content);

      await ChapterContent.bulkWrite(
        reordered.map((sibling, index) => ({
          updateOne: {
            filter: { _id: sibling._id },
            update: { $set: { order: index + 1 } },
          },
        })),
      );

      content.order = targetOrder;
    }

    await content.save();

    const updated = await ChapterContent.findById(content._id);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/chapters/:id/contents/:contentId]", error);
    return NextResponse.json(
      { error: "Failed to update chapter content." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contentId: string }> },
) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);
    if (!authenticatedUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (authenticatedUser.role !== "TEACHER" && authenticatedUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only teachers or admins can delete content." },
        { status: 403 },
      );
    }

    const { id, contentId } = await params;
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(contentId)) {
      return NextResponse.json(
        { error: "Invalid chapter or content id." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const [chapter, content] = await Promise.all([
      Chapter.findById(id),
      ChapterContent.findOne({ _id: contentId, chapterId: id }),
    ]);

    if (!chapter || !content) {
      return NextResponse.json({ error: "Content not found." }, { status: 404 });
    }

    if (
      authenticatedUser.role !== "ADMIN" &&
      chapter.instructorId.toString() !== authenticatedUser.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (content.type === "VIDEO" && content.muxAssetId) {
      await mux.video.assets
        .delete(content.muxAssetId)
        .catch((error) => console.error("[Mux chapter content cleanup]", error));
    }

    if (content.type === "VIDEO" && (content.durationMinutes ?? 0) > 0) {
      chapter.totalDurationMinutes = Math.max(
        0,
        sumDurationMinutes(chapter.totalDurationMinutes ?? 0, -(content.durationMinutes ?? 0)),
      );
      await chapter.save();
    }

    await ChapterContent.deleteOne({ _id: content._id });
    await resequenceContents(id);

    return NextResponse.json({ deleted: true, contentId });
  } catch (error) {
    console.error("[DELETE /api/chapters/:id/contents/:contentId]", error);
    return NextResponse.json(
      { error: "Failed to delete chapter content." },
      { status: 500 },
    );
  }
}
