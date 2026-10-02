import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Notice from "@/models/Notice";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    await Notice.findByIdAndDelete(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/admin/notices/[id]]", error);
    return NextResponse.json({ error: "Failed to delete notice" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { isActive } = await req.json();
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await connectToDatabase();
    const notice = await Notice.findByIdAndUpdate(
      id,
      { isActive },
      { new: true }
    );

    return NextResponse.json(notice);
  } catch (error) {
    console.error("[PATCH /api/admin/notices/[id]]", error);
    return NextResponse.json({ error: "Failed to update notice" }, { status: 500 });
  }
}
