import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // `allow` entries win over the broader `disallow` prefixes below, so the
      // public marketing surfaces stay crawlable while checkout stays private.
      allow: ["/", "/courses", "/chapters", "/pricing", "/quiz"],
      disallow: [
        "/api/",
        "/admin/",
        "/payment/",
        "/subscription/",
        "/search/",
        "/settings/",
        "/wallet/",
        "/studio/",
        "/channel/",
        "/message/",
        "/ask/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
