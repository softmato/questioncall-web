import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Note, { NOTE_FILE_TYPES, NOTE_VISIBILITY } from "@/models/Note";
import User from "@/models/User";
import { getAuthenticatedUser } from "@/lib/unified-auth";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/notes/[id] — fetch a single note
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await connectToDatabase();

    const note = await Note.findById(id)
      .populate("uploaderId", "name username userImage")
      .lean();

    if (!note) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    const uploader = note.uploaderId as unknown as {
      _id: string;
      name?: string;
      username?: string;
      userImage?: string;
    } | null;

    const isOwner = uploader?._id ? String(uploader._id) === authUser.id : false;

    // Private notes can only be viewed by the owner
    if ((note as any).visibility === "private" && !isOwner) {
      return NextResponse.json({ error: "This note is private." }, { status: 403 });
    }

    return NextResponse.json({
      id: String(note._id),
      title: note.title,
      description: note.description || "",
      subject: note.subject,
      grade: note.grade,
      fileType: note.fileType,
      fileUrl: note.fileUrl || null,
      visibility: (note as any).visibility || "public",
      price: (note as any).price || 0,
      uploaderId: uploader?._id ? String(uploader._id) : null,
      uploaderName: uploader?.name || "Unknown",
      uploaderUsername: uploader?.username || null,
      uploaderImage: uploader?.userImage || null,
      isOwner,
      createdAt: (note as any).createdAt?.toISOString?.() || new Date().toISOString(),
      updatedAt: (note as any).updatedAt?.toISOString?.() || new Date().toISOString(),
    });
  } catch (error) {
    console.error("[GET /api/notes/[id]]", error);
    return NextResponse.json(
      { error: "Failed to fetch note." },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/notes/[id] — update note metadata (owner only)
 * Body: { title?, description?, subject?, grade?, fileType?, fileUrl? }
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await connectToDatabase();

    const note = await Note.findById(id);
    if (!note) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    // Only the uploader can edit
    if (String(note.uploaderId) !== authUser.id) {
      return NextResponse.json(
        { error: "You can only edit your own notes." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { title, description, subject, grade, fileType, fileUrl, visibility, price } = body;

    if (title !== undefined) {
      if (!title.trim()) {
        return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
      }
      note.title = title.trim();
    }

    if (description !== undefined) {
      note.description = description.trim();
    }

    if (subject !== undefined) {
      if (!subject.trim()) {
        return NextResponse.json({ error: "Subject cannot be empty." }, { status: 400 });
      }
      note.subject = subject.trim();
    }

    if (grade !== undefined) {
      if (!grade.trim()) {
        return NextResponse.json({ error: "Grade cannot be empty." }, { status: 400 });
      }
      note.grade = grade.trim();
    }

    if (fileType !== undefined) {
      if (!NOTE_FILE_TYPES.includes(fileType)) {
        return NextResponse.json(
          { error: `Invalid file type. Must be one of: ${NOTE_FILE_TYPES.join(", ")}` },
          { status: 400 }
        );
      }
      note.fileType = fileType;
    }

    if (fileUrl !== undefined) {
      note.fileUrl = fileUrl || null;
    }

    if (visibility !== undefined) {
      if (!NOTE_VISIBILITY.includes(visibility)) {
        return NextResponse.json(
          { error: `Invalid visibility. Must be one of: ${NOTE_VISIBILITY.join(", ")}` },
          { status: 400 }
        );
      }
      note.visibility = visibility;
    }

    if (price !== undefined) {
      note.price = Math.max(0, Number(price) || 0);
    }

    await note.save();

    const user = await User.findById(authUser.id).select("name username userImage");

    return NextResponse.json({
      id: String(note._id),
      title: note.title,
      description: note.description || "",
      subject: note.subject,
      grade: note.grade,
      fileType: note.fileType,
      fileUrl: note.fileUrl || null,
      visibility: note.visibility || "public",
      price: note.price || 0,
      uploaderId: authUser.id,
      uploaderName: user?.name || "Unknown",
      uploaderUsername: user?.username || null,
      uploaderImage: user?.userImage || null,
      isOwner: true,
      createdAt: note.createdAt?.toISOString?.() || new Date().toISOString(),
      updatedAt: note.updatedAt?.toISOString?.() || new Date().toISOString(),
    });
  } catch (error) {
    console.error("[PATCH /api/notes/[id]]", error);
    return NextResponse.json(
      { error: "Failed to update note." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/notes/[id] — delete a note (owner or admin)
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await connectToDatabase();

    const note = await Note.findById(id);
    if (!note) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    const isOwner = String(note.uploaderId) === authUser.id;
    const isAdmin = authUser.role === "ADMIN";

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: "You can only delete your own notes." },
        { status: 403 }
      );
    }

    await Note.deleteOne({ _id: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/notes/[id]]", error);
    return NextResponse.json(
      { error: "Failed to delete note." },
      { status: 500 }
    );
  }
}
