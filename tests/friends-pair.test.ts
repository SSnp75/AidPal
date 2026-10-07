import { describe, it, expect } from "vitest";
import { pair } from "@/lib/friend-pair";

describe("pair", () => {
  const a = "11111111-1111-1111-1111-111111111111";
  const b = "22222222-2222-2222-2222-222222222222";

  it("is order-independent: pair(a,b) equals pair(b,a)", () => {
    expect(pair(a, b)).toEqual(pair(b, a));
  });

  it("orders by lexical comparison (user_low < user_high)", () => {
    const { user_low, user_high } = pair(b, a);
    expect(user_low).toBe(a);
    expect(user_high).toBe(b);
  });

  it("normalizes an uppercase-but-valid UUID to the same ordering as its lowercase form", () => {
    const upper = b.toUpperCase();
    // Lowercasing must happen before compare, otherwise "A" < "a" would
    // diverge from the Postgres uuid btree ordering.
    expect(pair(a, upper)).toEqual(pair(a, b));
    expect(pair(upper, a)).toEqual(pair(a, b));
    expect(pair(a, upper).user_high).toBe(b);
  });

  it("lowercases both inputs in the result", () => {
    const { user_low, user_high } = pair(a.toUpperCase(), b.toUpperCase());
    expect(user_low).toBe(a);
    expect(user_high).toBe(b);
  });
});
