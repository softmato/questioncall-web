/**
 * Questions are camera-first: the title is optional, so a photo-only question
 * has an empty `title`. Anywhere a question has to be named inside a sentence
 * — push notifications, chat auto-messages, wallet rows — run it through this
 * so it never renders as an empty string.
 */
export function questionSummary(
  question: {
    title?: string | null;
    body?: string | null;
    images?: string[] | null;
  },
  maxLength = 80,
  fallback = "a photo question",
): string {
  const title = question.title?.trim();
  if (title) return truncate(title, maxLength);

  const body = question.body?.trim().split("\n")[0]?.trim();
  if (body) return truncate(body, maxLength);

  return fallback;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength).trimEnd()}…` : value;
}
