import { describe, expect, it } from "vitest";
import ThemeToggle from "../../src/components/ThemeToggle.vue";
import { makeContext, mountWith } from "../support/mount.js";

describe("ThemeToggle", () => {
  it("shows the mode and cycles it", async () => {
    const ctx = await makeContext();
    const w = mountWith(ThemeToggle, ctx);
    expect(w.text()).toBe("Theme: auto");
    await w.find("button").trigger("click");
    expect(w.text()).toBe("Theme: light");
    expect(ctx.theme.mode.value).toBe("light");
  });
});
