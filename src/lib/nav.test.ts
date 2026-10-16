import { describe, it, expect } from "vitest";
import { isTabActive } from "@/lib/nav";

describe("isTabActive", () => {
  it("Home matches exactly at the root", () => {
    expect(isTabActive("/", "/")).toBe(true);
  });

  it("Home does not match a nested route", () => {
    expect(isTabActive("/groups", "/")).toBe(false);
  });

  it("Groups matches its own path", () => {
    expect(isTabActive("/groups", "/groups")).toBe(true);
  });

  it("Groups matches a nested group route", () => {
    expect(isTabActive("/groups/abc", "/groups")).toBe(true);
  });

  it("Groups does not match the root", () => {
    expect(isTabActive("/", "/groups")).toBe(false);
  });

  it("Groups does not match a prefix sibling", () => {
    expect(isTabActive("/groups-archive", "/groups")).toBe(false);
  });

  it("Messages matches only the messages route", () => {
    expect(isTabActive("/messages", "/messages")).toBe(true);
    expect(isTabActive("/events", "/messages")).toBe(false);
  });

  it("tolerates a trailing slash on href", () => {
    expect(isTabActive("/groups", "/groups/")).toBe(true);
    expect(isTabActive("/groups/abc", "/groups/")).toBe(true);
  });
});
