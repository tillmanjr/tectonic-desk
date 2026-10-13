import { describe, expect, it } from "vitest";
import { errorMessage } from "../../src/ingest/feed.js";

describe("errorMessage", () => {
  it("uses the message of an Error and stringifies anything else", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
    expect(errorMessage(42)).toBe("42");
  });
});
