import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import User from "@/models/User";
import { getAuthenticatedUser } from "@/lib/unified-auth";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!id) {
      return NextResponse.json({ error: "Notice ID required" }, { status: 400 });
    }

    await connectToDatabase();

    await User.findByIdAndUpdate(authUser.id, {
      $addToSet: { seenNotices: id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/notices/[id]/dismiss]", error);
    return NextResponse.json(
      { error: "Failed to dismiss notice." },
      { status: 500 }
    );
  }
}
