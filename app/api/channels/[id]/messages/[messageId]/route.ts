import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

import { getAuthenticatedUser } from "@/lib/unified-auth";
import { canDeleteStoredMessage } from "@/lib/message-deletion";
import { connectToDatabase } from "@/lib/mongodb";
import Message from "@/models/Message";
import Channel from "@/models/Channel";
import { emitMessageDeleted } from "@/lib/pusher/pusherServer";

cloudinary.config({ secure: true });

type RouteParams = { params: Promise<{ id: string; messageId: string }> };

export async function DELETE(request: Request, context: RouteParams) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;
    const { id: channelId, messageId } = await context.params;
    if (!Types.ObjectId.isValid(channelId) || !Types.ObjectId.isValid(messageId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await connectToDatabase();

    // Verify channel exists and user is a participant
    const channel = await Channel.findById(channelId)
      .select("askerId acceptorId")
      .lean();
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const askerId = channel.askerId.toString();
    const acceptorId = channel.acceptorId.toString();
    if (userId !== askerId && userId !== acceptorId) {
      return NextResponse.json(
        { error: "You are not a participant of this channel" },
        { status: 403 },
      );
    }

    // Fetch the message
    const message = await Message.findById(messageId);
    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    if (message.channelId.toString() !== channelId) {
      return NextResponse.json({ error: "Message does not belong to this channel" }, { status: 400 });
    }

    // Already deleted
    if (message.isDeleted) {
      return NextResponse.json({ success: true, alreadyDeleted: true });
    }

    if (!canDeleteStoredMessage(message, userId)) {
      if (message.senderId.toString() !== userId) {
        return NextResponse.json(
          { error: "You can only delete your own messages" },
          { status: 403 },
        );
      }

      return NextResponse.json(
        { error: "This message cannot be deleted" },
        { status: 400 },
      );
    }

    // Destroy Cloudinary asset if we have a public_id
    if (message.mediaPublicId) {
      const resourceType = message.mediaType === "VIDEO" ? "video"
        : message.mediaType === "AUDIO" ? "video" // Cloudinary treats audio as video resource
        : "image";

      await cloudinary.uploader
        .destroy(message.mediaPublicId, {
          resource_type: resourceType,
          invalidate: true,
        })
        .catch((err: unknown) => {
          console.error("[DELETE message] Cloudinary cleanup failed:", err);
        });
    }

    // Soft-delete: clear content/media, set deletion metadata
    message.isDeleted = true;
    message.deletedAt = new Date();
    message.deletedBy = userId as unknown as typeof message.deletedBy;
    message.content = "";
    message.mediaUrl = null;
    message.mediaType = null;
    message.mediaPublicId = null;
    message.isMarkedAsAnswer = false;
    await message.save();

    // Broadcast deletion in real-time
    await emitMessageDeleted(channelId, messageId, userId).catch(console.error);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/channels/[id]/messages/[messageId]]", error);
    return NextResponse.json(
      { error: "Failed to delete message" },
      { status: 500 },
    );
  }
}
