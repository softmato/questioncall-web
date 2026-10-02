import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectToDatabase } from "@/lib/mongodb";
import { getUserHandle } from "@/lib/user-paths";
import User from "@/models/User";

// Follow and profile-view notifications carry the phone app's profile route,
// /user/<id>; the website addresses profiles by handle.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let path = "/";

  if (Types.ObjectId.isValid(id)) {
    await connectToDatabase();
    const user = await User.findById(id)
      .select("name email username")
      .lean<{ name?: string; email?: string; username?: string }>();
    if (user) path = `/${getUserHandle({ id, ...user })}`;
  }

  return NextResponse.redirect(new URL(path, request.url));
}
