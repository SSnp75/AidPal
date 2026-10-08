/** Pure canonical-pair helper for the friendships table — no side effects. */

/**
 * Compute the canonical `{ user_low, user_high }` ordering for a pair of user
 * ids. Both inputs are lowercased before comparing: `isUUID` (src/lib/validation.ts)
 * accepts uppercase-but-valid UUIDs, and JS string compare only matches the
 * Postgres `uuid` btree ordering for consistently lowercased, hyphenated UUIDs.
 * `auth.uid()` is already lowercase; the client-supplied id may not be.
 * Normalizing both guarantees pair() agrees with the DB ordering, so the
 * read-existing-row step cannot miss a row (design.md §1/§4).
 */
export function pair(a: string, b: string): { user_low: string; user_high: string } {
  a = a.toLowerCase();
  b = b.toLowerCase();
  return a < b ? { user_low: a, user_high: b } : { user_low: b, user_high: a };
}
