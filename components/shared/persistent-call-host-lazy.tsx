"use client";

import dynamic from "next/dynamic";

// LiveKit, its stylesheet and Pusher stay out of every page's bundle until a
// signed-in page mounts this (app/layout.tsx); calls never reach visitors.
export const LazyPersistentCallHost = dynamic(
  () => import("@/components/shared/persistent-call-host").then((m) => m.PersistentCallHost),
  { ssr: false },
);
