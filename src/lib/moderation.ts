/** Pure moderation capability predicates — no network, no side effects. */

import type { ModerationStatus } from "@/types/db";

export type GroupRole = "owner" | "moderator" | "member" | null;

/** Owner or moderator may suspend/unsuspend groups, posts, comments. */
export function canModerate(role: GroupRole): boolean {
  return role === "owner" || role === "moderator";
}

/** Delete a post/comment: only the item's author or the group owner. */
export function canDeleteItem(role: GroupRole, isAuthor: boolean): boolean {
  return role === "owner" || isAuthor;
}

/** Delete the group: owner only. */
export function canDeleteGroup(role: GroupRole): boolean {
  return role === "owner";
}

// Re-export for convenience at call sites that already import from here.
export type { ModerationStatus };
