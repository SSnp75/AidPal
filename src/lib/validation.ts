/** Pure validation helpers — no network, no side effects. */

import type { ReactionType, EventScope, TaskStatus } from "@/types/db";

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
