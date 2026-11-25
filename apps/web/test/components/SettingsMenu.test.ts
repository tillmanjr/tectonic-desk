import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import SettingsMenu from "../../src/components/SettingsMenu.vue";
import { makeContext, mountWith } from "../support/mount.js";

describe("SettingsMenu", () => {
  it("opens to the zone, theme, beachball and marks controls, emits the zone toggle, and closes on Escape or an outside press", async () => {
    const ctx = await makeContext();
    const w = mountWith(SettingsMenu, ctx, { zone: "utc" });
    expect(w.find(".settings-menu").isVisible()).toBe(false);
    expect(w.find(".settings-btn").attributes("aria-expanded")).toBe("false");
    await w.find(".settings-btn").trigger("click");
    expect(w.find(".settings-btn").attributes("aria-expanded")).toBe("true");
    const rows = w.findAll(".srow");
    expect(rows.map((r) => r.find(".slabel").text())).toEqual([
      "Times",
      "Theme",
      "Beachball",
      "Deep dive marks",
    ]);
    expect(rows[0]?.find("button").text()).toBe("UTC");
    await rows[0]?.find("button").trigger("click");
    expect(w.findComponent(SettingsMenu).emitted("toggleZone")).toHaveLength(1);
    expect(rows[1]?.find("button").text()).toBe("Theme: auto");
    await rows[1]?.find("button").trigger("click");
    expect(ctx.theme.mode.value).toBe("light");
    const ball = rows[2]?.find("button");
    expect(ball?.text()).toBe("Flat");
    expect(ball?.attributes("aria-pressed")).toBe("false");
    await ball?.trigger("click");
    expect(ctx.settings.current.value.beachball).toBe("bowl");
    expect(ball?.text()).toBe("Bowl");
    await ball?.trigger("click");
    expect(ctx.settings.current.value.beachball).toBe("flat");
    const marks = rows[3]?.find("button");
    expect(marks?.text()).toBe("On");
    expect(marks?.attributes("aria-pressed")).toBe("true");
    await marks?.trigger("click");
    expect(ctx.settings.current.value.diveMarks).toBe(false);
    expect(marks?.text()).toBe("Off");
    await marks?.trigger("click");
    expect(ctx.settings.current.value.diveMarks).toBe(true);
    // a press inside keeps it open; one outside closes it
    w.find(".settings-menu").element.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(w.find(".settings-menu").isVisible()).toBe(true);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(w.find(".settings-menu").isVisible()).toBe(false);
    await w.find(".settings-btn").trigger("click");
    await w.find(".settings-menu button").trigger("keydown", { key: "Tab" });
    expect(w.find(".settings-menu").isVisible()).toBe(true);
    await w.find(".settings-menu button").trigger("keydown", { key: "Escape" });
    expect(w.find(".settings-menu").isVisible()).toBe(false);
    await w.find(".settings-btn").trigger("click");
    w.unmount();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });
});
