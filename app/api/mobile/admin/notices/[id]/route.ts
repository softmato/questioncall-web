import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { requireMobileAdmin } from "@/lib/mobile-admin-auth";
import { connectToDatabase } from "@/lib/mongodb";
import Notice from "@/models/Notice";

export const dynamic = "force-dynamic";

/** PATCH /api/mobile/admin/notices/[id] — toggle isActive. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireMobileAdmin(request);
  if (!gate.ok) return gate.response;

  try {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { isActive } = (await request.json().catch(() => ({}))) as {
      isActive?: boolean;
    };

    await connectToDatabase();
    const notice = await Notice.findByIdAndUpdate(id, { isActive }, { new: true });
    return NextResponse.json(notice);
  } catch (error) {
    console.error("PATCH /api/mobile/admin/notices/[id] error:", error);
    return NextResponse.json({ error: "Failed to update notice" }, { status: 500 });
  }
}

/** DELETE /api/mobile/admin/notices/[id] */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireMobileAdmin(request);
  if (!gate.ok) return gate.response;

  try {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await connectToDatabase();
    await Notice.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/mobile/admin/notices/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete notice" }, { status: 500 });
  }
}
