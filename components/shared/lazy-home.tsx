"use client";

import dynamic from "next/dynamic";

// The home route renders either the landing page or the signed-in feed. Behind
// a client-side dynamic() each is downloaded only by the audience that sees it;
// imported directly, every visitor also got the feed, its shell and Pusher, and
// every member the landing page.
export const PublicLanding = dynamic(() =>
  import("@/components/shared/public-landing").then((m) => m.PublicLanding),
);
export const WorkspaceShell = dynamic(() =>
  import("@/components/shared/workspace-shell").then((m) => m.WorkspaceShell),
);
export const WorkspaceHome = dynamic(() =>
  import("@/components/shared/workspace-home").then((m) => m.WorkspaceHome),
);
export const GlobalNoticeModal = dynamic(() =>
  import("@/components/shared/global-notice-modal").then((m) => m.GlobalNoticeModal),
);
export const CouponGiftModal = dynamic(() =>
  import("@/components/subscription/coupon-gift-modal").then((m) => m.CouponGiftModal),
);
