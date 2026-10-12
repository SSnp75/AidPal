import { describe, it, expect } from "vitest";
import { canModerate, canDeleteItem, canDeleteGroup } from "@/lib/moderation";
import { isModerationStatus } from "@/lib/validation";

describe("canModerate", () => {
  it("is true for owner and moderator", () => {
    expect(canModerate("owner")).toBe(true);
    expect(canModerate("moderator")).toBe(true);
  });

  it("is false for member and null", () => {
    expect(canModerate("member")).toBe(false);
    expect(canModerate(null)).toBe(false);
  });
});

describe("canDeleteItem", () => {
  it("is true for owner regardless of authorship", () => {
    expect(canDeleteItem("owner", false)).toBe(true);
    expect(canDeleteItem("owner", true)).toBe(true);
  });

  it("is true for any author regardless of role", () => {
    expect(canDeleteItem("member", true)).toBe(true);
    expect(canDeleteItem("moderator", true)).toBe(true);
    expect(canDeleteItem(null, true)).toBe(true);
  });

  it("is false for a non-author moderator, member, or null", () => {
    expect(canDeleteItem("moderator", false)).toBe(false);
    expect(canDeleteItem("member", false)).toBe(false);
    expect(canDeleteItem(null, false)).toBe(false);
  });
});

describe("canDeleteGroup", () => {
  it("is true only for owner", () => {
    expect(canDeleteGroup("owner")).toBe(true);
    expect(canDeleteGroup("moderator")).toBe(false);
    expect(canDeleteGroup("member")).toBe(false);
    expect(canDeleteGroup(null)).toBe(false);
  });
});

describe("isModerationStatus", () => {
  it("accepts the two valid statuses", () => {
    expect(isModerationStatus("active")).toBe(true);
    expect(isModerationStatus("suspended")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isModerationStatus("deleted")).toBe(false);
    expect(isModerationStatus("")).toBe(false);
    expect(isModerationStatus(null)).toBe(false);
    expect(isModerationStatus(undefined)).toBe(false);
    expect(isModerationStatus(1)).toBe(false);
  });
});
