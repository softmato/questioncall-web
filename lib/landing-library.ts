/**
 * Client-safe shape + formatters for the public landing page's library cards.
 * Kept out of `landing-highlights.ts` because that module is `server-only` and
 * the landing page is a client component.
 */

/** A published course or chapter, flattened into the shape the cards render. */
export type LandingLibraryItem = {
  id: string;
  kind: "COURSE" | "CHAPTER";
  href: string;
  title: string;
  subject: string;
  level: string;
  uploader: string;
  pricing: "FREE" | "SUBSCRIPTION" | "PAID";
  price: string | null;
  thumbnailUrl: string | null;
  lessons: number;
  durationMinutes: number;
  liveSessions: boolean;
  isFeatured: boolean;
};

// Cards are tinted per subject so the section keeps its colourful look without
// requiring teachers to pick a colour when publishing.
const CARD_COLORS = [
  "#1f766e",
  "#2176ae",
  "#7c3aed",
  "#f59e0b",
  "#db2777",
  "#0891b2",
];

export function getLandingItemColor(item: LandingLibraryItem, index: number) {
  const key = item.subject || item.title;
  const hash = [...key].reduce((sum, char) => sum + char.charCodeAt(0), index);
  return CARD_COLORS[hash % CARD_COLORS.length];
}

export function formatLandingDuration(minutes: number) {
  if (!minutes || minutes <= 0) return "New";
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours <= 0) return `${rest}m`;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}
