import type { UserRole } from "@/models/User";

export type UserPathInput = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  username?: string | null;
  role?: UserRole | null;
};

// Every top-level route: a handle equal to one of these would be a profile
// URL that the route shadows.
const reservedHandleSegments = new Set([
  "actions",
  "admin",
  "api",
  "app",
  "ask",
  "auth",
  "call",
  "calls",
  "channel",
  "chapters",
  "checkout",
  "courses",
  "leaderboard",
  "legal",
  "login",
  "menu",
  "message",
  "notes",
  "notices",
  "notifications",
  "onboarding",
  "payment",
  "pricing",
  "privacy",
  "profile",
  "question",
  "quiz",
  "referral",
  "register",
  "search",
  "settings",
  "student",
  "studio",
  "subscription",
  "teacher",
  "wallet",
]);

function sanitizeHandle(value?: string | null) {
  const handle = (value || "user")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  if (!handle) {
    return "user";
  }

  if (reservedHandleSegments.has(handle)) {
    return `${handle}_user`;
  }

  return handle;
}

export function getUserHandle(user?: UserPathInput | null) {
  const baseValue =
    user?.username?.trim() ||
    user?.name?.trim() ||
    user?.email?.split("@")[0]?.trim() ||
    user?.id?.trim() ||
    "user";

  return sanitizeHandle(baseValue);
}

export function getProfilePath(user?: UserPathInput | null) {
  if (!user) {
    return "/";
  }

  if (user.role === "ADMIN") {
    return "/admin/settings";
  }

  return `/${getUserHandle(user)}`;
}

export function getSettingsPath(user?: UserPathInput | null) {
  if (user?.role === "ADMIN") {
    return "/admin/settings";
  }

  return "/settings";
}

export function getSubscriptionPath(user?: UserPathInput | null) {
  if (user?.role === "ADMIN") {
    return "/admin/settings";
  }

  return "/subscription";
}

export function getWalletPath(user?: UserPathInput | null) {
  if (user?.role === "ADMIN") {
    return "/admin/settings";
  }

  return "/wallet";
}

export function getMessagesPath(user?: UserPathInput | null) {
  if (user?.role === "ADMIN") {
    return "/admin/settings";
  }

  return "/message";
}

export function getChannelPath(channelId?: string | null) {
  if (!channelId) {
    return "/message";
  }

  return `/channel/${channelId}`;
}

export function getAskQuestionPath(user?: UserPathInput | null) {
  if (user?.role === "ADMIN") {
    return "/admin/settings";
  }

  return "/ask";
}

export function getLeaderboardPath(user?: UserPathInput | null) {
  if (user?.role === "ADMIN") {
    return "/admin/settings";
  }

  return `/leaderboard/${getUserHandle(user)}`;
}

export function getSignInPath() {
  return "/auth/signin";
}

export function getSignOutPath() {
  return "/auth/signout";
}

export function getSignUpPath(role: "STUDENT" | "TEACHER") {
  return role === "STUDENT" ? "/auth/signup/student" : "/auth/signup/teacher";
}

export function getForgotPasswordPath() {
  return "/auth/forgot-password";
}
