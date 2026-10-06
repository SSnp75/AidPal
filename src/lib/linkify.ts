/**
 * Splits a block of text into plain-text and URL segments so URLs can be
 * rendered as clickable links. Only http(s) URLs are treated as links —
 * other schemes (e.g. javascript:) are left as plain text to avoid XSS.
 */

export type TextSegment =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

// Match http:// or https:// URLs. Trailing punctuation is trimmed afterward.
const URL_REGEX = /\bhttps?:\/\/[^\s<]+/gi;

export function linkify(text: string): TextSegment[] {
  if (!text) return [];

  const segments: TextSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_REGEX)) {
    const start = match.index ?? 0;
    let url = match[0];

    // Trim trailing punctuation that is unlikely to be part of the URL
    // (e.g. "see https://example.com." or "(https://example.com)").
    let trailing = "";
    const trailingMatch = url.match(/[.,;:!?)\]}'"]+$/);
    if (trailingMatch) {
      trailing = trailingMatch[0];
      url = url.slice(0, url.length - trailing.length);
    }

    // Leading text before this URL.
    if (start > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, start) });
    }

    segments.push({ type: "link", value: url, href: url });

    if (trailing) segments.push({ type: "text", value: trailing });

    lastIndex = start + match[0].length;
  }

  // Remaining trailing text.
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments;
}
