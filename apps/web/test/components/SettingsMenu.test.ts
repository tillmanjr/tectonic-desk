import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import SettingsMenu from "../../src/components/SettingsMenu.vue";
import { makeContext, mountWith } from "../support/mount.js";

describe("SettingsMenu", () => {
  it("opens to the zone and theme controls, emits the zone toggle, and closes on Escape or an outside press", async () => {
    const ctx = await makeContext();
    const w = mountWith(SettingsMenu, ctx, { zone: "utc" });
    expect(w.find(".settings-menu").exists()).toBe(false);
    expect(w.find(".settings-btn").attributes("aria-expanded")).toBe("false");
    await w.find(".settings-btn").trigger("click");
    expect(w.find(".settings-btn").attributes("aria-expanded")).toBe("true");
    const rows = w.findAll(".srow");
    expect(rows.map((r) => r.find(".slabel").text())).toEqual(["Times", "Theme"]);
    expect(rows[0]?.find("button").text()).toBe("UTC");
    await rows[0]?.find("button").trigger("click");
    expect(w.findComponent(SettingsMenu).emitted("toggleZone")).toHaveLength(1);
    expect(rows[1]?.find("button").text()).toBe("Theme: auto");
    await rows[1]?.find("button").trigger("click");
    expect(ctx.theme.mode.value).toBe("light");
    // a press inside keeps it open; one outside closes it
    w.find(".settings-menu").element.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(w.find(".settings-menu").exists()).toBe(true);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(w.find(".settings-menu").exists()).toBe(false);
    await w.find(".settings-btn").trigger("click");
    await w.find(".settings-menu button").trigger("keydown", { key: "Tab" });
    expect(w.find(".settings-menu").exists()).toBe(true);
    await w.find(".settings-menu button").trigger("keydown", { key: "Escape" });
    expect(w.find(".settings-menu").exists()).toBe(false);
    await w.find(".settings-btn").trigger("click");
    w.unmount();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });
});
