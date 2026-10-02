/**
 * Single source of truth for the platform display name.
 * Import this everywhere instead of hardcoding "QuestionCall".
 */
export const APP_NAME = "QuestionCall";
export const CONTACT_SERVICE_EMAIL = "questioncall24@gmail.com";
export const MAX_CUSTOMER_SERVICE_CONTACTS = 3;
export const DEFAULT_SOCIAL_HANDLE_BASE =
  CONTACT_SERVICE_EMAIL.split("@")[0] ?? "questioncall";

export const SOCIAL_HANDLE_META = [
  {
    key: "facebook",
    label: "Facebook",
    badge: "FB",
    badgeClassName: "bg-[#1877F2] text-white",
    placeholder: "https://facebook.com/questioncall24",
  },
  {
    key: "instagram",
    label: "Instagram",
    badge: "IG",
    badgeClassName: "bg-[#E4405F] text-white",
    placeholder: "https://instagram.com/questioncall24",
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    badge: "WA",
    badgeClassName: "bg-[#25D366] text-white",
    placeholder: "https://wa.me/97798XXXXXXXX",
  },
  {
    key: "youtube",
    label: "YouTube",
    badge: "YT",
    badgeClassName: "bg-[#FF0033] text-white",
    placeholder: "https://youtube.com/@questioncall24",
  },
  {
    key: "twitter",
    label: "Twitter / X",
    badge: "X",
    badgeClassName: "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900",
    placeholder: "https://x.com/questioncall24",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    badge: "in",
    badgeClassName: "bg-[#0A66C2] text-white",
    placeholder: "https://linkedin.com/company/questioncall24",
  },
  {
    key: "telegram",
    label: "Telegram",
    badge: "TG",
    badgeClassName: "bg-[#229ED9] text-white",
    placeholder: "https://t.me/questioncall24",
  },
  {
    key: "tiktok",
    label: "TikTok",
    badge: "TT",
    badgeClassName: "bg-black text-white",
    placeholder: "https://www.tiktok.com/@questioncall24",
  },
  {
    key: "discord",
    label: "Discord",
    badge: "DS",
    badgeClassName: "bg-[#5865F2] text-white",
    placeholder: "https://discord.gg/questioncall24",
  },
  {
    key: "website",
    label: "Website",
    badge: "WWW",
    badgeClassName: "bg-emerald-600 text-white",
    placeholder: "https://questioncall.com",
  },
] as const;

export type SocialHandleKey = (typeof SOCIAL_HANDLE_META)[number]["key"];

export type PlatformSocialLink = {
  platform: SocialHandleKey;
  url: string;
};

export const DEFAULT_PLATFORM_SOCIAL_HANDLES: Record<SocialHandleKey, string> = {
  facebook: `@${DEFAULT_SOCIAL_HANDLE_BASE}`,
  instagram: `@${DEFAULT_SOCIAL_HANDLE_BASE}`,
  whatsapp: `@${DEFAULT_SOCIAL_HANDLE_BASE}`,
  youtube: `@${DEFAULT_SOCIAL_HANDLE_BASE}`,
  twitter: `@${DEFAULT_SOCIAL_HANDLE_BASE}`,
  linkedin: `/${DEFAULT_SOCIAL_HANDLE_BASE}`,
  telegram: `@${DEFAULT_SOCIAL_HANDLE_BASE}`,
  tiktok: "",
  discord: "",
  website: "",
};

export const DEFAULT_PLATFORM_SOCIAL_LINKS: PlatformSocialLink[] =
  SOCIAL_HANDLE_META.map((item) => ({
    platform: item.key,
    url: DEFAULT_PLATFORM_SOCIAL_HANDLES[item.key],
  }));

export function getSocialHandleMeta(platform: SocialHandleKey) {
  return SOCIAL_HANDLE_META.find((item) => item.key === platform);
}

function normalizeWhatsappValue(value: string) {
  return value.replace(/[^\d]/g, "");
}

function normalizePathValue(value: string) {
  return value.replace(/^@/, "").replace(/^\/+/, "").trim();
}

export function getSocialLinkHref(platform: SocialHandleKey, value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmedValue)) {
    return trimmedValue;
  }

  if (/^[a-z]+:\/\//i.test(trimmedValue)) {
    return trimmedValue;
  }

  switch (platform) {
    case "facebook":
      return `https://facebook.com/${normalizePathValue(trimmedValue)}`;
    case "instagram":
      return `https://instagram.com/${normalizePathValue(trimmedValue)}`;
    case "whatsapp": {
      const digits = normalizeWhatsappValue(trimmedValue);
      return digits ? `https://wa.me/${digits}` : null;
    }
    case "youtube":
      return `https://youtube.com/${trimmedValue.replace(/^\/+/, "").replace(/^@/, "@")}`;
    case "twitter":
      return `https://x.com/${normalizePathValue(trimmedValue)}`;
    case "linkedin":
      return `https://linkedin.com/${trimmedValue.replace(/^\/+/, "")}`;
    case "telegram":
      return `https://t.me/${normalizePathValue(trimmedValue)}`;
    case "tiktok":
      return `https://www.tiktok.com/${trimmedValue.replace(/^\/+/, "").replace(/^@/, "@")}`;
    case "discord":
      return trimmedValue.startsWith("discord.gg/")
        ? `https://${trimmedValue}`
        : `https://discord.gg/${normalizePathValue(trimmedValue)}`;
    case "website":
      return `https://${trimmedValue.replace(/^\/+/, "")}`;
    default:
      return trimmedValue;
  }
}

export function normalizePlatformSocialLinks(
  rawLinks: unknown,
  options?: { fallbackToDefault?: boolean },
) {
  if (!Array.isArray(rawLinks)) {
    return options?.fallbackToDefault ? [...DEFAULT_PLATFORM_SOCIAL_LINKS] : [];
  }

  const allowedPlatforms = new Set<SocialHandleKey>(
    SOCIAL_HANDLE_META.map((item) => item.key),
  );
  const normalizedByPlatform = new Map<SocialHandleKey, PlatformSocialLink>();

  for (const rawLink of rawLinks) {
    if (!rawLink || typeof rawLink !== "object") {
      continue;
    }

    const platform =
      "platform" in rawLink && typeof rawLink.platform === "string"
        ? (rawLink.platform as SocialHandleKey)
        : null;

    if (!platform || !allowedPlatforms.has(platform)) {
      continue;
    }

    const url =
      "url" in rawLink && typeof rawLink.url === "string" ? rawLink.url.trim() : "";

    normalizedByPlatform.set(platform, {
      platform,
      url,
    });
  }

  return SOCIAL_HANDLE_META.flatMap((item) => {
    const existing = normalizedByPlatform.get(item.key);
    return existing ? [existing] : [];
  });
}

export function getDefaultPlatformSocialLinks() {
  return [...DEFAULT_PLATFORM_SOCIAL_LINKS];
}

/** Default meta description — keep under 160 chars for SERP display. */
export const APP_DESCRIPTION =
  "QuestionCall connects students with expert teachers for real-time Q&A, guided courses, and interactive quizzes — all in one academic platform.";
