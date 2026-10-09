import { describe, it, expect } from "vitest";
import {
  validateEventTitle,
  validateEventDescription,
  validateEventLocation,
  validateEventTaskTitle,
  EVENT_SCOPES,
  isEventScope,
  TASK_STATUSES,
  isTaskStatus,
} from "@/lib/validation";

/* ── event title (1–120) ── */
describe("validateEventTitle", () => {
  it("accepts a valid title", () => {
    expect(validateEventTitle("Beach cleanup")).toEqual({ ok: true });
  });
  it("accepts 1 char (lower boundary)", () => {
    expect(validateEventTitle("x")).toEqual({ ok: true });
  });
  it("accepts 120 chars (max boundary)", () => {
    expect(validateEventTitle("x".repeat(120))).toEqual({ ok: true });
  });
  it("rejects empty", () => {
    expect(validateEventTitle("")).toHaveProperty("ok", false);
  });
  it("rejects whitespace-only", () => {
    expect(validateEventTitle("   ")).toHaveProperty("ok", false);
  });
  it("rejects 121 chars (max+1)", () => {
    expect(validateEventTitle("x".repeat(121))).toHaveProperty("ok", false);
  });
  it("rejects non-string", () => {
    expect(validateEventTitle(null)).toHaveProperty("ok", false);
    expect(validateEventTitle(123)).toHaveProperty("ok", false);
  });
});

/* ── event description (optional, ≤2000) ── */
describe("validateEventDescription", () => {
  it("accepts empty/null (optional)", () => {
    expect(validateEventDescription("")).toEqual({ ok: true });
    expect(validateEventDescription(null)).toEqual({ ok: true });
    expect(validateEventDescription(undefined)).toEqual({ ok: true });
  });
  it("accepts a valid description", () => {
    expect(validateEventDescription("Bring gloves.")).toEqual({ ok: true });
  });
  it("accepts 2000 chars (max boundary)", () => {
    expect(validateEventDescription("x".repeat(2000))).toEqual({ ok: true });
  });
  it("rejects 2001 chars (max+1)", () => {
    expect(validateEventDescription("x".repeat(2001))).toHaveProperty("ok", false);
  });
  it("rejects non-string", () => {
    expect(validateEventDescription(123)).toHaveProperty("ok", false);
  });
});

/* ── event location (optional, ≤200) ── */
describe("validateEventLocation", () => {
  it("accepts empty/null (optional)", () => {
    expect(validateEventLocation("")).toEqual({ ok: true });
    expect(validateEventLocation(null)).toEqual({ ok: true });
    expect(validateEventLocation(undefined)).toEqual({ ok: true });
  });
  it("accepts a valid location", () => {
    expect(validateEventLocation("Central Park")).toEqual({ ok: true });
  });
  it("accepts 200 chars (max boundary)", () => {
    expect(validateEventLocation("x".repeat(200))).toEqual({ ok: true });
  });
  it("rejects 201 chars (max+1)", () => {
    expect(validateEventLocation("x".repeat(201))).toHaveProperty("ok", false);
  });
  it("rejects non-string", () => {
    expect(validateEventLocation(123)).toHaveProperty("ok", false);
  });
});

/* ── event task title (1–200) ── */
describe("validateEventTaskTitle", () => {
  it("accepts a valid task title", () => {
    expect(validateEventTaskTitle("Set up tables")).toEqual({ ok: true });
  });
  it("accepts 1 char (lower boundary)", () => {
    expect(validateEventTaskTitle("x")).toEqual({ ok: true });
  });
  it("accepts 200 chars (max boundary)", () => {
    expect(validateEventTaskTitle("x".repeat(200))).toEqual({ ok: true });
  });
  it("rejects empty", () => {
    expect(validateEventTaskTitle("")).toHaveProperty("ok", false);
  });
  it("rejects whitespace-only", () => {
    expect(validateEventTaskTitle("   ")).toHaveProperty("ok", false);
  });
  it("rejects 201 chars (max+1)", () => {
    expect(validateEventTaskTitle("x".repeat(201))).toHaveProperty("ok", false);
  });
  it("rejects non-string", () => {
    expect(validateEventTaskTitle(null)).toHaveProperty("ok", false);
    expect(validateEventTaskTitle(123)).toHaveProperty("ok", false);
  });
});

/* ── isEventScope ── */
describe("isEventScope", () => {
  it("accepts the three allowed scopes", () => {
    expect(EVENT_SCOPES).toEqual(["individual", "group", "public"]);
    expect(isEventScope("individual")).toBe(true);
    expect(isEventScope("group")).toBe(true);
    expect(isEventScope("public")).toBe(true);
  });
  it("rejects other strings", () => {
    expect(isEventScope("private")).toBe(false);
    expect(isEventScope("")).toBe(false);
  });
  it("rejects non-strings", () => {
    expect(isEventScope(null)).toBe(false);
    expect(isEventScope(1)).toBe(false);
    expect(isEventScope({})).toBe(false);
  });
});

/* ── isTaskStatus ── */
describe("isTaskStatus", () => {
  it("accepts the three allowed statuses", () => {
    expect(TASK_STATUSES).toEqual(["todo", "in_progress", "done"]);
    expect(isTaskStatus("todo")).toBe(true);
    expect(isTaskStatus("in_progress")).toBe(true);
    expect(isTaskStatus("done")).toBe(true);
  });
  it("rejects other strings", () => {
    expect(isTaskStatus("pending")).toBe(false);
    expect(isTaskStatus("")).toBe(false);
  });
  it("rejects non-strings", () => {
    expect(isTaskStatus(null)).toBe(false);
    expect(isTaskStatus(1)).toBe(false);
    expect(isTaskStatus({})).toBe(false);
  });
});
