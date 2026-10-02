import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { JWT_SECRET } from "@/lib/env";
import { getUserHandle } from "@/lib/user-paths";

type AppRole = "STUDENT" | "TEACHER" | "ADMIN";

const defaultPathByRole: Record<AppRole, string> = {
  STUDENT: "/",
  TEACHER: "/",
  ADMIN: "/admin/settings",
};

const sessionCookieNames = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "authjs.session-token",
  "__Secure-authjs.session-token",
] as const;

function redirectToDefaultPath(request: NextRequest, role: AppRole) {
  return NextResponse.redirect(new URL(defaultPathByRole[role], request.url));
}

function redirectToProfilePath(
  request: NextRequest,
  token: {
    role?: AppRole;
    sub?: string | null;
    name?: string | null;
    email?: string | null;
    username?: string | null;
  },
) {
  if (token.role === "ADMIN") {
    return redirectToDefaultPath(request, "ADMIN");
  }

  const profileUrl = new URL(
    `/${getUserHandle({
      id: typeof token.sub === "string" ? token.sub : undefined,
      name: typeof token.name === "string" ? token.name : undefined,
      email: typeof token.email === "string" ? token.email : undefined,
      username: typeof token.username === "string" ? token.username : undefined,
    })}`,
    request.url,
  );

  return NextResponse.redirect(profileUrl);
}

function redirectToSignIn(request: NextRequest) {
  const signInUrl = new URL("/auth/signin", request.url);
  signInUrl.searchParams.set(
    "callbackUrl",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(signInUrl);
}

// Signed-in-only pages outside the role-gated groups below. Each page also
// redirects a signed-out visitor, but only here is the requested path still
// known, so only a redirect from here can bring them back after sign-in.
const signInRequiredPrefixes = [
  "/actions",
  "/call",
  "/calls",
  "/courses/my",
  "/daily-target",
  "/leaderboard",
  "/menu",
  "/notes",
  "/notices",
  "/notifications",
  "/onboarding",
  "/profile",
  "/question",
  "/referral",
  "/search",
  "/studio",
  "/upload-course",
] as const;
const signInRequiredPatterns = [
  /^\/quiz\/[^/]+/,
  /^\/chapters\/[^/]+\/buy$/,
  /^\/courses\/[^/]+\/manage$/,
];

function requiresSignIn(pathname: string) {
  return (
    signInRequiredPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    ) || signInRequiredPatterns.some((pattern) => pattern.test(pathname))
  );
}

function requestHasSessionCookie(request: NextRequest) {
  return sessionCookieNames.some((cookieName) => request.cookies.has(cookieName));
}

function clearSessionCookies(response: NextResponse) {
  for (const cookieName of sessionCookieNames) {
    response.cookies.set(cookieName, "", {
      expires: new Date(0),
      path: "/",
    });
  }

  response.cookies.set("next-auth.callback-url", "", {
    expires: new Date(0),
    path: "/",
  });
  response.cookies.set("authjs.callback-url", "", {
    expires: new Date(0),
    path: "/",
  });

  return response;
}

function resetBrokenSession(request: NextRequest) {
  const resetUrl = new URL(request.nextUrl.pathname, request.url);
  resetUrl.search = request.nextUrl.search;
  return clearSessionCookies(NextResponse.redirect(resetUrl));
}

/**
 * Old cookie names from before the HTTPS migration.
 * Auto-cleaned so users don't need to manually clear cookies.
 */
const staleCookieNames = [
  "next-auth.session-token",
  "next-auth.callback-url",
  "next-auth.csrf-token",
] as const;

function expireStaleCookies(request: NextRequest, response: NextResponse) {
  // In local dev (HTTP), NextAuth uses "next-auth.session-token" as the active
  // session cookie — same name as the stale pre-HTTPS cookie we're trying to
  // clean up. Only run this cleanup in production where the __Secure- prefix
  // cookie is the real one and the plain name is guaranteed to be stale.
  if (process.env.NODE_ENV !== "production") return response;

  for (const name of staleCookieNames) {
    if (request.cookies.has(name)) {
      response.cookies.set(name, "", { expires: new Date(0), path: "/" });
    }
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = requestHasSessionCookie(request);

  let token = null;

  try {
    token = await getToken({
      req: request,
      secret: JWT_SECRET,
    });
  } catch {
    return resetBrokenSession(request);
  }

  if (hasSessionCookie && !token) {
    return resetBrokenSession(request);
  }

  const role = token?.role as AppRole | undefined;
  const isAuthEntryRoute =
    pathname === "/auth/signin" ||
    pathname.startsWith("/auth/signup/") ||
    pathname === "/login" ||
    pathname.startsWith("/register");

  if (isAuthEntryRoute && role) {
    return redirectToDefaultPath(request, role);
  }

  const isSharedProtectedRoute =
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/subscription" ||
    pathname.startsWith("/subscription/") ||
    pathname === "/wallet" ||
    pathname.startsWith("/wallet/") ||
    pathname === "/message" ||
    pathname.startsWith("/message/") ||
    pathname.startsWith("/channel/") ||
    pathname.startsWith("/ask/") ||
    pathname === "/leaderboard" ||
    pathname.startsWith("/leaderboard/");
  const isStudentRoute = pathname.startsWith("/student");
  const isTeacherRoute = pathname.startsWith("/teacher");
  const isAdminRoute = pathname.startsWith("/admin");
  const isProtectedRoute =
    isSharedProtectedRoute || isStudentRoute || isTeacherRoute || isAdminRoute;

  if (!role && requiresSignIn(pathname)) {
    return redirectToSignIn(request);
  }

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  if (!role) {
    return redirectToSignIn(request);
  }

  if (isStudentRoute && role !== "STUDENT") {
    return redirectToProfilePath(request, token ?? {});
  }

  if (isTeacherRoute && role !== "TEACHER") {
    return redirectToProfilePath(request, token ?? {});
  }

  if (isAdminRoute && role !== "ADMIN") {
    return redirectToProfilePath(request, token ?? {});
  }

  if (isSharedProtectedRoute && role === "ADMIN") {
    return redirectToDefaultPath(request, role);
  }

  const response = NextResponse.next();
  expireStaleCookies(request, response);
  return response;
}

export const config = {
  matcher: [
    "/auth/:path*",
    "/settings/:path*",
    "/subscription/:path*",
    "/wallet/:path*",
    "/message/:path*",
    "/channel/:path*",
    "/ask/:path*",
    "/leaderboard/:path*",
    "/actions/:path*",
    "/call/:path*",
    "/calls/:path*",
    "/courses/my/:path*",
    "/courses/:slug/manage",
    "/chapters/:slug/buy",
    "/daily-target/:path*",
    "/menu/:path*",
    "/notes/:path*",
    "/notices/:path*",
    "/notifications/:path*",
    "/onboarding/:path*",
    "/profile/:path*",
    "/question/:path*",
    "/quiz/:path+",
    "/referral/:path*",
    "/search/:path*",
    "/studio/:path*",
    "/upload-course/:path*",
    "/student/:path*",
    "/teacher/:path*",
    "/admin/:path*",
  ],
};

export default proxy;

 
