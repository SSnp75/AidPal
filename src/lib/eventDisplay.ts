/**
 * Format an event's ISO timestamp for display, or return null when there is
 * nothing valid to show. Never produces "Invalid Date": a null/empty or
 * unparseable input yields null so callers can simply omit the date.
 */
export function formatEventDate(iso: string | null): string | null {
  if (!iso) return null;
  if (Number.isNaN(Date.parse(iso))) return null;
  return new Date(iso).toLocaleString();
}
