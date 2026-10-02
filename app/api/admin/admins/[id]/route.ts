import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendAdminNotificationEmail } from "@/lib/sendEmails/sendAdminNotificationEmail";

export async function DELETE(
  _request: Request,
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

    const currentAdmin = await User.findById(session.user.id).select("isMasterAdmin");
    if (!currentAdmin?.isMasterAdmin) {
      return NextResponse.json({ error: "Only master admin can remove admins" }, { status: 403 });
    }

    if (id === session.user.id) {
      return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
    }

    const targetAdmin = await User.findById(id);
    if (!targetAdmin || targetAdmin.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }

    if (targetAdmin.isMasterAdmin) {
      return NextResponse.json({ error: "Cannot remove master admin" }, { status: 400 });
    }

    await User.findByIdAndDelete(id);

    return NextResponse.json({ message: "Admin removed successfully" });
  } catch (error: unknown) {
    console.error("Remove Admin Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
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
    const body = await request.json();
    const { makeMasterAdmin } = body;

    await connectToDatabase();

    const currentAdmin = await User.findById(session.user.id).select("isMasterAdmin");
    if (!currentAdmin?.isMasterAdmin) {
      return NextResponse.json({ error: "Only master admin can promote admins" }, { status: 403 });
    }

    const targetAdmin = await User.findById(id);
    if (!targetAdmin || targetAdmin.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }

    if (makeMasterAdmin === true) {
      await User.updateMany({ role: "ADMIN" }, { isMasterAdmin: false });
      targetAdmin.isMasterAdmin = true;
      await targetAdmin.save();

      await sendAdminNotificationEmail({
        email: targetAdmin.email,
        fullName: targetAdmin.name,
        role: "MASTER_ADMIN",
        action: "promoted",
        promotedBy: session.user.name || "Master Admin",
      });
    }

    return NextResponse.json({ message: "Admin updated successfully" });
  } catch (error: unknown) {
    console.error("Update Admin Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}