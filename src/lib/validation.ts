/** Pure validation helpers — no network, no side effects. */

import type { ReactionType, EventScope, TaskStatus, ModerationStatus } from "@/types/db";

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(raw: unknown): ValidationResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "Enter a valid email." };
  }
  const email = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Enter a valid email." };
  }
  return { ok: true };
}

export function validatePassword(raw: unknown): ValidationResult {
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, error: "Password must be at least 8 characters (max 72 bytes)." };
  }
  if (raw.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters (max 72 bytes)." };
  }
  const byteLen = new TextEncoder().encode(raw).length;
  if (byteLen > 72) {
    return { ok: false, error: "Password must be at least 8 characters (max 72 bytes)." };
  }
  return { ok: true };
}

export function validateDisplayName(raw: unknown): ValidationResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "Display name is required (1–60 characters)." };
  }
  const name = raw.trim();
  if (name.length > 60) {
    return { ok: false, error: "Display name is required (1–60 characters)." };
  }
  return { ok: true };
}

export function validateBio(raw: unknown): ValidationResult {
  if (raw == null || raw === "") return { ok: true };
  if (typeof raw !== "string") {
    return { ok: false, error: "Bio must be 500 characters or fewer." };
  }
  if (raw.length > 500) {
    return { ok: false, error: "Bio must be 500 characters or fewer." };
  }
  return { ok: true };
}

export function validateAvatarUrl(raw: unknown): ValidationResult {
  if (raw == null || raw === "") return { ok: true };
  if (typeof raw !== "string") {
    return { ok: false, error: "Enter a valid http(s) URL for avatar." };
  }
  if (raw.length > 2048) {
    return { ok: false, error: "Avatar URL must be 2048 characters or fewer." };
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, error: "Enter a valid http(s) URL for avatar." };
    }
  } catch {
    return { ok: false, error: "Enter a valid http(s) URL for avatar." };
  }
  return { ok: true };
}

export function validateGroupName(raw: unknown): ValidationResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "Group name is required (1–100 characters)." };
  }
  if (raw.trim().length > 100) {
    return { ok: false, error: "Group name is required (1–100 characters)." };
  }
  return { ok: true };
}

export function validateGroupDescription(raw: unknown): ValidationResult {
  if (raw == null || raw === "") return { ok: true };
  if (typeof raw !== "string") {
    return { ok: false, error: "Description must be 1000 characters or fewer." };
  }
  if (raw.length > 1000) {
    return { ok: false, error: "Description must be 1000 characters or fewer." };
  }
  return { ok: true };
}

export function coerceIsPrivate(raw: unknown): boolean {
  if (raw === "on" || raw === "true" || raw === true) return true;
  return false;
}

export function validatePostBody(raw: unknown): ValidationResult {
  if (raw == null || raw === "") return { ok: true };
  if (typeof raw !== "string") {
    return { ok: false, error: "Post body must be 2000 characters or fewer." };
  }
  if (raw.length > 2000) {
    return { ok: false, error: "Post body must be 2000 characters or fewer." };
  }
  return { ok: true };
}

export function validateCommentBody(raw: unknown): ValidationResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "Comment is required (1–1000 characters)." };
  }
  if (raw.trim().length > 1000) {
    return { ok: false, error: "Comment is required (1–1000 characters)." };
  }
  return { ok: true };
}

export const MAX_MESSAGE_LEN = 2000;

export function validateMessageBody(raw: unknown): ValidationResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "Message can't be empty." };
  }
  // Count Unicode code points, not UTF-16 code units, so the bound matches
  // the table CHECK's char_length() for astral-plane input (emoji, CJK ext).
  if ([...raw.trim()].length > MAX_MESSAGE_LEN) {
    return { ok: false, error: "Message is too long (max 2000 characters)." };
  }
  return { ok: true };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUUID(raw: unknown): boolean {
  return typeof raw === "string" && UUID_RE.test(raw);
}

/**
 * Allowed reaction types. Typed as `readonly ReactionType[]` so the literal
 * list is compiler-checked against the canonical union in `@/types/db` —
 * the runtime list and the type can never silently diverge.
 */
export const REACTION_TYPES: readonly ReactionType[] = ["like", "love", "dislike"];

export function isReactionType(raw: unknown): raw is ReactionType {
  return typeof raw === "string" && (REACTION_TYPES as readonly string[]).includes(raw);
}

/**
 * Allowed moderation statuses. Typed as `readonly ModerationStatus[]` so the
 * literal list is compiler-checked against the canonical union in `@/types/db`
 * (mirrors REACTION_TYPES / isReactionType).
 */
export const MODERATION_STATUSES: readonly ModerationStatus[] = ["active", "suspended"];

export function isModerationStatus(raw: unknown): raw is ModerationStatus {
  return typeof raw === "string" && (MODERATION_STATUSES as readonly string[]).includes(raw);
}

export function validateEventTitle(raw: unknown): ValidationResult {
  if (typeof raw !== "string" || raw.trim().length === 0)
    return { ok: false, error: "Event title is required (1–120 characters)." };
  if (raw.trim().length > 120)
    return { ok: false, error: "Event title is required (1–120 characters)." };
  return { ok: true };
}

export function validateEventDescription(raw: unknown): ValidationResult {
  if (raw == null || raw === "") return { ok: true };
  if (typeof raw !== "string" || raw.length > 2000)
    return { ok: false, error: "Description must be 2000 characters or fewer." };
  return { ok: true };
}

export function validateEventLocation(raw: unknown): ValidationResult {
  if (raw == null || raw === "") return { ok: true };
  if (typeof raw !== "string" || raw.length > 200)
    return { ok: false, error: "Location must be 200 characters or fewer." };
  return { ok: true };
}

export function validateEventTaskTitle(raw: unknown): ValidationResult {
  if (typeof raw !== "string" || raw.trim().length === 0)
    return { ok: false, error: "Task title is required (1–200 characters)." };
  if (raw.trim().length > 200)
    return { ok: false, error: "Task title is required (1–200 characters)." };
  return { ok: true };
}

/**
 * Allowed event scopes. Typed as `readonly EventScope[]` so the literal list
 * is compiler-checked against the canonical union in `@/types/db` — the
 * runtime list and the type can never silently diverge (mirrors REACTION_TYPES).
 */
export const EVENT_SCOPES: readonly EventScope[] = ["individual", "group", "public"];

export function isEventScope(raw: unknown): raw is EventScope {
  return typeof raw === "string" && (EVENT_SCOPES as readonly string[]).includes(raw);
}

/**
 * Allowed task statuses. Typed as `readonly TaskStatus[]` so the literal list
 * is compiler-checked against the canonical union in `@/types/db`.
 */
export const TASK_STATUSES: readonly TaskStatus[] = ["todo", "in_progress", "done"];

export function isTaskStatus(raw: unknown): raw is TaskStatus {
  return typeof raw === "string" && (TASK_STATUSES as readonly string[]).includes(raw);
}

/**
 * Validate a `next` redirect path.
 * Accept only a single-leading-`/` same-origin relative path.
 * Reject `//...`, any scheme/`:`, empty/null → fallback `/profile`.
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || next.length === 0) return "/profile";
  // Must start with exactly one `/` (not `//`)
  if (!next.startsWith("/") || next.startsWith("//")) return "/profile";
  // Must not contain a `:` (blocks `javascript:`, `https:`, etc.)
  if (next.includes(":")) return "/profile";
  return next;
}

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// ── Group organization ──

import type { GroupScope } from "@/types/db";

export const GROUP_CATEGORY_SLUGS = [
  "environment",
  "education",
  "health",
  "animals",
  "disaster-relief",
  "food-hunger",
  "homelessness",
  "arts-culture",
  "sports",
  "infrastructure",
  "travel",
  "community",
] as const;
export type GroupCategorySlug = (typeof GROUP_CATEGORY_SLUGS)[number];

export function isGroupCategorySlug(raw: unknown): raw is GroupCategorySlug {
  return (
    typeof raw === "string" &&
    (GROUP_CATEGORY_SLUGS as readonly string[]).includes(raw)
  );
}

export const GROUP_SCOPES: readonly GroupScope[] = [
  "local",
  "national",
  "global",
  "group",
] as const;

export function isGroupScope(raw: unknown): raw is GroupScope {
  return typeof raw === "string" && (GROUP_SCOPES as string[]).includes(raw);
}

export const MAX_TAGS = 10;
export const MAX_TAG_LEN = 30;
export const MAX_CITY_LEN = 100;

/** Normalize one tag: trim, lowercase, spaces→hyphens, collapse/strip hyphens, cap length. */
export function normalizeTag(raw: string): string {
  let t = raw.trim().toLocaleLowerCase("en");
  t = t.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return [...t].slice(0, MAX_TAG_LEN).join("");
}

/** Normalize a CSV string or array into a deduped, non-empty tag list (order preserved). */
export function normalizeTags(raw: unknown): string[] {
  let tokens: string[] = [];
  if (Array.isArray(raw)) {
    tokens = raw.filter((x): x is string => typeof x === "string");
  } else if (typeof raw === "string") {
    tokens = raw.split(",");
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    const t = normalizeTag(token);
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/**
 * Extract auto-tags from a post body. A sigil (`@ # $ % &`) opens a tagging
 * region: every word from a sigil up to the next sigil (or end of body) becomes
 * a tag. Text before the first sigil is ignored. Each word is split on
 * whitespace and punctuation and normalized (lowercased, trimmed); the list is
 * deduped with order preserved.
 *
 * Examples:
 *   "#Nepal, flood"                 → ["nepal", "flood"]
 *   "#Nepal flood @relief now"      → ["nepal", "flood", "relief", "now"]
 *   "think about #resettlement for" → ["resettlement", "for"]
 */
export function extractTagsFromBody(body: string): string[] {
  if (typeof body !== "string" || body.length === 0) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  // Each region starts at a sigil and runs until the next sigil or end.
  // [1] is the region text (everything after the opening sigil, before the next).
  const regionRe = /[@#$%&]([^@#$%&]*)/gu;
  // Words inside a region: runs of letters/digits/_/-; punctuation/space splits.
  const wordRe = /[\p{L}\p{N}_-]+/gu;

  for (const region of body.matchAll(regionRe)) {
    for (const w of region[1].matchAll(wordRe)) {
      const t = normalizeTag(w[0]);
      if (t && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
  }
  return out;
}

export function validateTags(
  raw: unknown
): { ok: true; value: string[] } | { ok: false; error: string } {
  const tags = normalizeTags(raw);
  if (tags.length > MAX_TAGS) {
    return { ok: false, error: `Use at most ${MAX_TAGS} tags.` };
  }
  return { ok: true, value: tags };
}

export function validateCity(
  raw: unknown
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw == null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "Invalid city." };
  const city = raw.trim();
  if (city === "") return { ok: true, value: null };
  if (city.length > MAX_CITY_LEN) {
    return { ok: false, error: `City must be ${MAX_CITY_LEN} characters or fewer.` };
  }
  return { ok: true, value: city };
}

/** Shape check only (2-char uppercase). Existence is verified against the DB. */
export function validateCountryCode(
  raw: unknown
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw == null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "Invalid country." };
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    return { ok: false, error: "Pick a country from the list." };
  }
  return { ok: true, value: code };
}

/** Strip PostgREST filter meta-characters so a keyword is safe in .ilike()/.or(). */
export function escapePostgrestLike(raw: string): string {
  return raw
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[,().*:"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
