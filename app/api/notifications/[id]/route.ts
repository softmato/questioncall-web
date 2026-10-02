import { Types } from "mongoose";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Notification from "@/models/Notification";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PATCH /api/notifications/[id]/read]", error);
    return NextResponse.json({ error: "Failed to mark notification as read" }, { status: 500 });
  }
}

// Mark ALL notifications as read
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (id !== "all") {
      return NextResponse.json({ error: "Invalid route" }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    await Notification.updateMany({ userId: session.user.id, isRead: false }, { isRead: true });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/notifications/all]", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
