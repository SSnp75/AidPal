/** Pure group-affinity helpers — no network, no side effects. */

import type { GroupRole } from "@/lib/moderation";

interface GroupRef {
  id: string;
  name: string;
}

/**
 * Reduce raw {id, name} rows (one per liked/loved post's owning group, so the
 * same group can appear many times) to a distinct list keyed by id. Preserves
 * first-seen order and drops rows with a falsy id or name.
 */
export function distinctInterestedGroups(rows: GroupRef[]): GroupRef[] {
  const seen = new Set<string>();
  const out: GroupRef[] = [];
  for (const r of rows) {
    if (!r || !r.id || !r.name) continue;
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({ id: r.id, name: r.name });
  }
  return out;
}

/**
 * May the viewer leave this group? True only for a member or moderator
 * (role is non-null and not "owner"); false for the owner and non-members.
 */
export function canLeaveGroup(role: GroupRole): boolean {
  return role !== null && role !== "owner";
}
