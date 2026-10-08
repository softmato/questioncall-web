import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/unified-auth";
import { connectToDatabase } from "@/lib/mongodb";
import { isWebPushConfigured } from "@/lib/push/web-push";
import PushSubscriptionModel from "@/models/PushSubscription";

type PushSubscriptionInput = {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
  platform?: "web" | "ios" | "android";
};

export const runtime = "nodejs";

const STALE_MOBILE_TOKEN_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    subscription?: PushSubscriptionInput;
  };
  const subscription = body.subscription;
  const platform = subscription?.platform ?? "web";

  // FCM (Android) tokens don't use VAPID or web-push keys — skip those checks
  if (platform !== "android" && !isWebPushConfigured()) {
    return NextResponse.json(
      { error: "Push notifications are not configured yet." },
      { status: 503 },
    );
  }

  if (!subscription?.endpoint) {
    return NextResponse.json(
      { error: "A valid push subscription is required." },
      { status: 400 },
    );
  }

  if (platform !== "android" && (!subscription.keys?.p256dh || !subscription.keys?.auth)) {
    return NextResponse.json(
      { error: "A valid push subscription is required." },
      { status: 400 },
    );
  }

  await connectToDatabase();

  const updateFields: Record<string, unknown> = {
    userId: user.id,
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime ?? null,
    userAgent: request.headers.get("user-agent"),
    platform,
  };

  // FCM (Android) tokens have no web-push keys — only store keys for web/iOS
  if (platform !== "android") {
    updateFields.keys = {
      p256dh: subscription.keys!.p256dh,
      auth: subscription.keys!.auth,
    };
  }

  // Upsert the new subscription
  await PushSubscriptionModel.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    { $set: updateFields },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  // Clean up this user's stale mobile tokens (old Expo Go installs, reinstalls).
  //
  // Only STALE ones. This used to delete every other token on the platform,
  // which made a user's phones evict each other: whichever device opened the
  // app last was the only one push could reach, so calls to a backgrounded or
  // killed phone silently never arrived. Every launch re-subscribes and bumps
  // updatedAt, so a token untouched this long belongs to an install nobody
  // opens; dead tokens are also pruned by expo-push on DeviceNotRegistered.
  if (platform === "android" || platform === "ios") {
    await PushSubscriptionModel.deleteMany({
      userId: user.id,
      platform,
      endpoint: { $ne: subscription.endpoint },
      updatedAt: { $lt: new Date(Date.now() - STALE_MOBILE_TOKEN_MS) },
    }).catch(() => null);
  }

  return NextResponse.json({ success: true });
}
