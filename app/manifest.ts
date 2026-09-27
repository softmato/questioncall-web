import type { MetadataRoute } from "next";

import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants";

/**
 * What gets installed is the QuestionCall app itself — the phone app exported
 * for the browser and served at /app — not the website in a window, so
 * start_url, scope and id point there and installing from any page installs
 * the app. No trailing slash on scope or start_url: Next redirects /app/ to
 * /app, which a /app/ scope would exclude. White, like the app's own
 * background: Android paints the status and navigation bars in theme_color.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app/",
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    start_url: "/app",
    scope: "/app",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "en",
    categories: ["education", "productivity", "social"],
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  };
}
