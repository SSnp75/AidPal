import { describe, it, expect } from "vitest";
import { validateMessageBody, MAX_MESSAGE_LEN } from "@/lib/validation";

const EMPTY_ERR = "Message can't be empty.";
const TOO_LONG_ERR = "Message is too long (max 2000 characters).";

/* ── validateMessageBody ── */
describe("validateMessageBody", () => {
  it("rejects empty string with the empty copy", () => {
    expect(validateMessageBody("")).toEqual({ ok: false, error: EMPTY_ERR });
  });

  it("rejects whitespace-only with the empty copy", () => {
    expect(validateMessageBody("   \t\n ")).toEqual({ ok: false, error: EMPTY_ERR });
  });

  it("accepts a single character", () => {
    expect(validateMessageBody("x")).toEqual({ ok: true });
  });

  it("accepts exactly 2000 characters after trimming", () => {
    expect(validateMessageBody("  " + "x".repeat(MAX_MESSAGE_LEN) + "  ")).toEqual({ ok: true });
  });

  it("rejects 2001 characters after trimming with the too-long copy", () => {
    expect(validateMessageBody("x".repeat(MAX_MESSAGE_LEN + 1))).toEqual({
      ok: false,
      error: TOO_LONG_ERR,
    });
  });

  it("accepts 1500 emoji (code-point count, not UTF-16 units)", () => {
    // 1500 code points but 3000 UTF-16 code units — must be accepted (Finding 1).
    expect(validateMessageBody("😀".repeat(1500))).toEqual({ ok: true });
  });

  it("rejects 2001 emoji with the too-long copy", () => {
    expect(validateMessageBody("😀".repeat(MAX_MESSAGE_LEN + 1))).toEqual({
      ok: false,
      error: TOO_LONG_ERR,
    });
  });

  it("rejects null with the empty copy", () => {
    expect(validateMessageBody(null)).toEqual({ ok: false, error: EMPTY_ERR });
  });

  it("rejects a number with the empty copy", () => {
    expect(validateMessageBody(42)).toEqual({ ok: false, error: EMPTY_ERR });
  });

  it("accepts valid content with surrounding whitespace", () => {
    expect(validateMessageBody("  hello  ")).toEqual({ ok: true });
  });
});
