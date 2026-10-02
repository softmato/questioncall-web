import { Types } from "mongoose";

import { connectToDatabase } from "@/lib/mongodb";
import { MESSAGE_MARKED_EVENT, getChannelPusherName } from "@/lib/pusher/events";
import { pusherServer } from "@/lib/pusher/pusherServer";
import Channel from "@/models/Channel";
import Message from "@/models/Message";

type MarkChannelMessageParams = {
  channelId: string;
  messageId: string;
  userId: string;
  isMarkedAsAnswer: boolean;
};

type MarkChannelMessageResult =
  | { ok: true; isMarkedAsAnswer: boolean }
  | { ok: false; error: string; status: number };

export async function markChannelMessageAsAnswer({
  channelId,
  messageId,
  userId,
  isMarkedAsAnswer,
}: MarkChannelMessageParams): Promise<MarkChannelMessageResult> {
  if (!Types.ObjectId.isValid(channelId) || !Types.ObjectId.isValid(messageId)) {
    return { ok: false, error: "Message not found in this channel", status: 404 };
  }
  await connectToDatabase();

  const channel = await Channel.findById(channelId);
  if (!channel) {
    return { ok: false, error: "Channel not found", status: 404 };
  }

  if (channel.status !== "ACTIVE") {
    return { ok: false, error: "Channel is not active", status: 400 };
  }

  if (channel.acceptorId.toString() !== userId) {
    return {
      ok: false,
      error: "Only the acceptor (teacher) can mark messages as answers",
      status: 403,
    };
  }

  const message = await Message.findOne({ _id: messageId, channelId });
  if (!message) {
    return { ok: false, error: "Message not found in this channel", status: 404 };
  }

  if (message.senderId.toString() !== userId) {
    return {
      ok: false,
      error: "You can only mark your own messages as answers",
      status: 403,
    };
  }

  message.isMarkedAsAnswer = isMarkedAsAnswer;
  await message.save();

  if (pusherServer) {
    await pusherServer.trigger(getChannelPusherName(channelId), MESSAGE_MARKED_EVENT, {
      messageId,
      isMarkedAsAnswer,
    });
  }

  return { ok: true, isMarkedAsAnswer };
}
