import { describe, it, expect } from "vitest";
import { distinctInterestedGroups, canLeaveGroup } from "@/lib/affinity";

describe("distinctInterestedGroups", () => {
  it("dedupes repeated ids to a single entry (one group, many liked posts)", () => {
    const rows = [
      { id: "g1", name: "Flood Relief" },
      { id: "g1", name: "Flood Relief" },
      { id: "g2", name: "Food Drive" },
      { id: "g1", name: "Flood Relief" },
    ];
    expect(distinctInterestedGroups(rows)).toEqual([
      { id: "g1", name: "Flood Relief" },
      { id: "g2", name: "Food Drive" },
    ]);
  });

  it("preserves first-seen order", () => {
    const rows = [
      { id: "b", name: "Beta" },
      { id: "a", name: "Alpha" },
      { id: "c", name: "Gamma" },
    ];
    expect(distinctInterestedGroups(rows).map((g) => g.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("returns [] for []", () => {
    expect(distinctInterestedGroups([])).toEqual([]);
  });

  it("drops malformed rows (missing id or name)", () => {
    const rows = [
      { id: "", name: "No Id" },
      { id: "g1", name: "" },
      { id: "g2", name: "Valid" },
    ];
    expect(distinctInterestedGroups(rows)).toEqual([
      { id: "g2", name: "Valid" },
    ]);
  });
});

describe("canLeaveGroup", () => {
  it("is true for member and moderator", () => {
    expect(canLeaveGroup("member")).toBe(true);
    expect(canLeaveGroup("moderator")).toBe(true);
  });

  it("is false for owner and null", () => {
    expect(canLeaveGroup("owner")).toBe(false);
    expect(canLeaveGroup(null)).toBe(false);
  });
});
