import { describe, it, expect } from "vitest";
import {
  validateEmail,
  validatePassword,
  validateDisplayName,
  validateBio,
  validateAvatarUrl,
  validateGroupName,
  validateGroupDescription,
  validatePostBody,
  validateCommentBody,
  isUUID,
  safeNextPath,
  coerceIsPrivate,
} from "@/lib/validation";
import { buildMediaKey } from "@/lib/storage-path";

/* ── email ── */
describe("validateEmail", () => {
  it("accepts a valid email", () => {
    expect(validateEmail("user@example.com")).toEqual({ ok: true });
  });
  it("rejects empty", () => {
    expect(validateEmail("")).toHaveProperty("ok", false);
  });
  it("rejects missing @", () => {
    expect(validateEmail("no-at-sign")).toHaveProperty("ok", false);
  });
});

/* ── password ── */
describe("validatePassword", () => {
  it("accepts 8-char password", () => {
    expect(validatePassword("abcdefgh")).toEqual({ ok: true });
  });
  it("rejects short password", () => {
    expect(validatePassword("abc")).toHaveProperty("ok", false);
  });
  it("rejects >72 bytes", () => {
    // 73 multibyte chars (each 2 bytes)
    const long = "ñ".repeat(37); // 37 * 2 = 74 bytes
    expect(validatePassword(long)).toHaveProperty("ok", false);
  });
});

/* ── displayName ── */
describe("validateDisplayName", () => {
  it("accepts valid name", () => {
    expect(validateDisplayName("Alice")).toEqual({ ok: true });
  });
  it("rejects empty", () => {
    expect(validateDisplayName("")).toHaveProperty("ok", false);
  });
  it("rejects >60", () => {
    expect(validateDisplayName("x".repeat(61))).toHaveProperty("ok", false);
  });
});

/* ── bio ── */
describe("validateBio", () => {
  it("accepts empty/null", () => {
    expect(validateBio("")).toEqual({ ok: true });
    expect(validateBio(null)).toEqual({ ok: true });
  });
  it("rejects >500", () => {
    expect(validateBio("x".repeat(501))).toHaveProperty("ok", false);
  });
});

/* ── avatarUrl ── */
describe("validateAvatarUrl", () => {
  it("accepts empty", () => {
    expect(validateAvatarUrl("")).toEqual({ ok: true });
  });
  it("accepts https url", () => {
    expect(validateAvatarUrl("https://example.com/pic.jpg")).toEqual({ ok: true });
  });
  it("rejects non-http", () => {
    expect(validateAvatarUrl("ftp://files.example.com")).toHaveProperty("ok", false);
  });
  it("rejects >2048", () => {
    expect(validateAvatarUrl("https://x.co/" + "a".repeat(2040))).toHaveProperty("ok", false);
  });
});

/* ── group name / description ── */
describe("validateGroupName", () => {
  it("accepts valid", () => {
    expect(validateGroupName("My Group")).toEqual({ ok: true });
  });
  it("rejects empty", () => {
    expect(validateGroupName("")).toHaveProperty("ok", false);
  });
  it("rejects >100", () => {
    expect(validateGroupName("a".repeat(101))).toHaveProperty("ok", false);
  });
});

describe("validateGroupDescription", () => {
  it("accepts empty", () => {
    expect(validateGroupDescription("")).toEqual({ ok: true });
  });
  it("rejects >1000", () => {
    expect(validateGroupDescription("x".repeat(1001))).toHaveProperty("ok", false);
  });
});

/* ── post / comment ── */
describe("validatePostBody", () => {
  it("accepts empty", () => {
    expect(validatePostBody("")).toEqual({ ok: true });
  });
  it("rejects >2000", () => {
    expect(validatePostBody("x".repeat(2001))).toHaveProperty("ok", false);
  });
});

describe("validateCommentBody", () => {
  it("accepts valid", () => {
    expect(validateCommentBody("Nice!")).toEqual({ ok: true });
  });
  it("rejects empty", () => {
    expect(validateCommentBody("")).toHaveProperty("ok", false);
  });
  it("rejects >1000", () => {
    expect(validateCommentBody("x".repeat(1001))).toHaveProperty("ok", false);
  });
});

/* ── coerceIsPrivate ── */
describe("coerceIsPrivate", () => {
  it("returns true for 'on'", () => {
    expect(coerceIsPrivate("on")).toBe(true);
  });
  it("returns false for null", () => {
    expect(coerceIsPrivate(null)).toBe(false);
  });
});

/* ── UUID ── */
describe("isUUID", () => {
  it("accepts valid uuid", () => {
    expect(isUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });
  it("rejects garbage", () => {
    expect(isUUID("not-a-uuid")).toBe(false);
  });
});

/* ── safeNextPath ── */
describe("safeNextPath", () => {
  it("passes /groups", () => {
    expect(safeNextPath("/groups")).toBe("/groups");
  });
  it("passes /profile/edit", () => {
    expect(safeNextPath("/profile/edit")).toBe("/profile/edit");
  });
  it("blocks //evil.com", () => {
    expect(safeNextPath("//evil.com")).toBe("/profile");
  });
  it("blocks https://evil.example", () => {
    expect(safeNextPath("https://evil.example")).toBe("/profile");
  });
  it("blocks javascript:alert(1)", () => {
    expect(safeNextPath("javascript:alert(1)")).toBe("/profile");
  });
  it("blocks null", () => {
    expect(safeNextPath(null)).toBe("/profile");
  });
  it("blocks empty", () => {
    expect(safeNextPath("")).toBe("/profile");
  });
});

/* ── storage path builder ── */
describe("buildMediaKey", () => {
  it("builds correct key for jpeg", () => {
    expect(
      buildMediaKey("g1", "p1", "f1", "image/jpeg")
    ).toBe("group/g1/p1/f1.jpg");
  });
  it("builds correct key for png", () => {
    expect(
      buildMediaKey("g1", "p1", "f1", "image/png")
    ).toBe("group/g1/p1/f1.png");
  });
  it("builds correct key for webp", () => {
    expect(
      buildMediaKey("g1", "p1", "f1", "image/webp")
    ).toBe("group/g1/p1/f1.webp");
  });
  it("builds correct key for gif", () => {
    expect(
      buildMediaKey("g1", "p1", "f1", "image/gif")
    ).toBe("group/g1/p1/f1.gif");
  });
});
