import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Notice from "@/models/Notice";
import User from "@/models/User";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  void req;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await connectToDatabase();

    const notice = await Notice.findById(id).select("title").lean();
    if (!notice) {
      return NextResponse.json({ error: "Notice not found" }, { status: 404 });
    }

    const viewers = await User.find({ seenNotices: id })
      .select("name email username role userImage")
      .sort({ name: 1, email: 1 })
      .lean();

    return NextResponse.json({
      noticeId: id,
      title: notice.title,
      viewerCount: viewers.length,
      viewers: viewers.map((viewer) => ({
        _id: viewer._id.toString(),
        name: viewer.name || viewer.username || viewer.email || "Unknown user",
        email: viewer.email || "",
        username: viewer.username || null,
        role: viewer.role || "STUDENT",
        userImage: viewer.userImage || null,
      })),
    });
  } catch (error) {
    console.error("[GET /api/admin/notices/[id]/seen]", error);
    return NextResponse.json(
      { error: "Failed to fetch notice viewers" },
      { status: 500 },
    );
  }
}
