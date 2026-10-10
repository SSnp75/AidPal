import { describe, it, expect } from "vitest";
import { formatEventDate } from "@/lib/eventDisplay";

describe("formatEventDate", () => {
  it("returns null for null input", () => {
    expect(formatEventDate(null)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(formatEventDate("")).toBeNull();
  });

  it("returns a non-null string for a valid ISO timestamp", () => {
    const result = formatEventDate("2024-01-15T10:30:00.000Z");
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
  });

  it("returns null for an unparseable string", () => {
    expect(formatEventDate("not-a-date")).toBeNull();
  });
});
