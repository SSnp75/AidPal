import { describe, it, expect } from "vitest";
import { getInitials } from "@/lib/avatar";

describe("getInitials", () => {
  it("extracts two initials from two words", () => {
    expect(getInitials("Jane Doe")).toBe("JD");
  });
  it("extracts one initial from a single word", () => {
    expect(getInitials("Alice")).toBe("A");
  });
  it("uses first and last word only", () => {
    expect(getInitials("John Paul Jones")).toBe("JJ");
  });
  it("returns ? for empty string", () => {
    expect(getInitials("")).toBe("?");
  });
  it("returns ? for null", () => {
    expect(getInitials(null)).toBe("?");
  });
  it("returns ? for undefined", () => {
    expect(getInitials(undefined)).toBe("?");
  });
  it("trims whitespace", () => {
    expect(getInitials("  Maya  Rivers  ")).toBe("MR");
  });
  it("uppercases lowercase input", () => {
    expect(getInitials("grace owens")).toBe("GO");
  });
});
