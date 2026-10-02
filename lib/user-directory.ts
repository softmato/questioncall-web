import "server-only";

import { cache } from "react";

import { connectToDatabase } from "@/lib/mongodb";
import User, { type UserRole } from "@/models/User";
import { getUserHandle } from "@/lib/user-paths";

type DirectoryUser = {
  _id: { toString(): string } | string;
  name: string;
  email: string;
  username?: string | null;
  role: UserRole;
  points?: number;
  pointBalance?: number;
  totalAnswered?: number;
  overallScore?: number;
  createdAt?: Date | string;
  bio?: string;
  userImage?: string;
  skills?: string[];
  interests?: string[];
  totalAsked?: number;
  questionsAsked?: number;
  teacherModeVerified?: boolean;
};

export type PublicDirectoryUser = {
  id: string;
  name: string;
  email: string;
  username: string;
  role: UserRole;
  points: number;
  pointBalance: number;
  totalAnswered: number;
  overallScore: number;
  createdAt?: Date | string;
  bio?: string;
  userImage?: string;
  skills?: string[];
  interests?: string[];
  totalAsked?: number;
  questionsAsked: number;
  teacherModeVerified?: boolean;
};

export type LeaderboardGroup = "students" | "teachers" | "all";

const publicDirectorySelect =
  "name email username role points pointBalance totalAnswered overallScore overallRatingSum overallRatingCount createdAt bio userImage skills interests totalAsked questionsAsked teacherModeVerified";

function mapDirectoryUser(user: DirectoryUser): PublicDirectoryUser {
  const id = typeof user._id === "string" ? user._id : user._id.toString();

  return {
    id,
    name: user.name,
    email: user.email,
    username: getUserHandle({
      id,
      name: user.name,
      email: user.email,
      username: user.username,
    }),
    role: user.role,
    points: user.points ?? 0,
    pointBalance: user.pointBalance ?? 0,
    totalAnswered: user.totalAnswered ?? 0,
    overallScore: user.overallScore ?? 0,
    createdAt: user.createdAt,
    bio: user.bio,
    userImage: user.userImage,
    skills: user.skills || [],
    interests: user.interests || [],
    totalAsked: user.totalAsked ?? 0,
    questionsAsked: user.questionsAsked ?? 0,
    teacherModeVerified: user.teacherModeVerified ?? false,
  };
}

function getStudentActivityCount(user: PublicDirectoryUser) {
  return Math.max(user.totalAsked ?? 0, user.questionsAsked ?? 0);
}

function sortLeaderboardProfiles(
  left: PublicDirectoryUser,
  right: PublicDirectoryUser,
  group: LeaderboardGroup,
) {
  const scoreDifference = getLeaderboardScore(right, group) - getLeaderboardScore(left, group);

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  const pointsDifference = (right.points ?? 0) - (left.points ?? 0);

  if (pointsDifference !== 0) {
    return pointsDifference;
  }

  const ratingDifference = (right.overallScore ?? 0) - (left.overallScore ?? 0);

  if (ratingDifference !== 0) {
    return ratingDifference;
  }

  return left.name.localeCompare(right.name);
}

export async function generateUniqueUsername(input: {
  name?: string | null;
  email?: string | null;
  id?: string | null;
}) {
  await connectToDatabase();

  const baseHandle = getUserHandle(input);
  let candidate = baseHandle;
  let counter = 1;

  while (await User.exists({ username: candidate })) {
    candidate = `${baseHandle}_${counter}`;
    counter += 1;
  }

  return candidate;
}

export const getPublicUserByUsername = cache(async (username: string) => {
  const normalizedUsername = getUserHandle({ username });

  await connectToDatabase();

  const directUser = (await User.findOne({ username: normalizedUsername })
    .select(publicDirectorySelect)
    .lean()) as DirectoryUser | null;

  if (directUser) {
    return mapDirectoryUser(directUser);
  }

  // Only legacy accounts without a stored username need their handle derived
  // from name/email. Scanning everyone here made every unknown top-level path
  // (bot probes included) load the whole user collection.
  const fallbackUsers = (await User.find({
    role: { $in: ["STUDENT", "TEACHER"] },
    $or: [{ username: { $exists: false } }, { username: null }, { username: "" }],
  })
    .select(publicDirectorySelect)
    .lean()) as DirectoryUser[];

  const fallbackUser = fallbackUsers.find((user) => {
    return mapDirectoryUser(user).username === normalizedUsername;
  });

  return fallbackUser ? mapDirectoryUser(fallbackUser) : null;
});

export function getLeaderboardScore(
  user: PublicDirectoryUser,
  group: LeaderboardGroup = "all",
) {
  if (group === "students") {
    return getStudentActivityCount(user);
  }

  if (group === "teachers") {
    return user.totalAnswered;
  }

  return user.role === "STUDENT"
    ? getStudentActivityCount(user)
    : user.totalAnswered;
}

export function getLeaderboardMetricLabel(
  user: PublicDirectoryUser,
  group: LeaderboardGroup = "all",
) {
  if (group === "students" || user.role === "STUDENT") {
    return "questions asked";
  }

  return "questions solved";
}

export function getLeaderboardMetricValue(
  user: PublicDirectoryUser,
  group: LeaderboardGroup = "all",
) {
  return getLeaderboardScore(user, group);
}

const getDirectoryUsers = cache(async () => {
  await connectToDatabase();

  const users = (await User.find({ role: { $in: ["STUDENT", "TEACHER"] } })
    .select(publicDirectorySelect)
    .lean()) as DirectoryUser[];

  return users.map(mapDirectoryUser);
});

export const getLeaderboardProfiles = cache(async (group: LeaderboardGroup = "all") => {
  const users = await getDirectoryUsers();

  return users
    .filter((user) => {
      if (group === "students") {
        return user.role === "STUDENT";
      }

      if (group === "teachers") {
        return user.role === "TEACHER";
      }

      return true;
    })
    .sort((left, right) => sortLeaderboardProfiles(left, right, group));
});

export async function getMasterAdminEmails(): Promise<string[]> {
  await connectToDatabase();

  const masterAdmins = await User.find({
    role: "ADMIN",
    isMasterAdmin: true,
  }).select("email").lean();

  return masterAdmins
    .map((admin) => admin.email)
    .filter((email): email is string => !!email);
}

export async function getAllAdminEmails(): Promise<string[]> {
  await connectToDatabase();

  const admins = await User.find({
    role: "ADMIN",
  }).select("email").lean();

  return admins
    .map((admin) => admin.email)
    .filter((email): email is string => !!email);
}
