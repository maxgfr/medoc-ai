import { describe, expect, test } from "bun:test";
import { kept } from "./db";

describe("kept", () => {
  test("a write that lands is kept; one the full storage refuses is not, and never throws", async () => {
    expect(await kept(Promise.resolve())).toBe(true);
    expect(
      await kept(
        Promise.reject(new DOMException("The quota has been exceeded.", "QuotaExceededError")),
      ),
    ).toBe(false);
  });
});
