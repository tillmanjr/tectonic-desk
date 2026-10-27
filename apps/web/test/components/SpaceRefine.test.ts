import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import SpaceRefine from "../../src/components/SpaceRefine.vue";
import { makeContext, mountWith } from "../support/mount.js";
import { spaceWindow } from "../support/space.js";

describe("SpaceRefine", () => {
  it("shows the window in force and writes a new length or a fixed range", async () => {
    const ctx = await makeContext({ space: true });
    const w = mountWith(SpaceRefine, ctx);
    const select = w.find("select");
    expect(select.element.value).toBe("24h");
    expect(w.findAll("option").map((o) => o.text())).toEqual([
      "Custom",
      "6 hours",
      "24 hours",
      "3 days",
      "7 days",
      "30 days",
      "1 year",
      "11 years",
      "Since 1932",
    ]);
    const [from, to] = w.findAll("input");
    expect(from?.element.value).toBe("2026-10-12T12:00");
    expect(to?.element.value).toBe("2026-10-13T12:00");
    expect(w.find(".fto").text()).toBe("from (UTC)");
    expect(w.find("button").attributes("disabled")).toBeDefined();
    expect(w.find(".fnote").exists()).toBe(false);

    await select.setValue("7d");
    expect(ctx.setSpaceRange).toHaveBeenLastCalledWith({ kind: "window", id: "7d" });
    await select.setValue("");
    expect(ctx.setSpaceRange).toHaveBeenCalledTimes(1);

    await from?.setValue("2026-10-13T06:00");
    expect(ctx.setSpaceRange).toHaveBeenLastCalledWith({
      kind: "fixed",
      from: new Date("2026-10-13T06:00:00Z"),
      to: new Date("2026-10-13T12:00:00Z"),
    });
    await to?.setValue("2026-10-13T09:30");
    expect(ctx.setSpaceRange).toHaveBeenLastCalledWith({
      kind: "fixed",
      from: new Date("2026-10-12T12:00:00Z"),
      to: new Date("2026-10-13T09:30:00Z"),
    });
    // reversed, over the cap or unparseable: ignored
    await to?.setValue("2026-10-12T06:00");
    await from?.setValue("1900-01-01T00:00");
    await from?.setValue("yesterday");
    expect(ctx.setSpaceRange).toHaveBeenCalledTimes(3);
    w.unmount();
  });

  it("marks a fixed range as custom, offers Live, notes the bucket and follows the zone", async () => {
    const ctx = await makeContext({ space: true });
    ctx.space.range.value = {
      kind: "fixed",
      from: new Date("2026-10-01T00:00:00Z"),
      to: new Date("2026-10-08T00:00:00Z"),
    };
    ctx.space.window.value = spaceWindow({ bucketSeconds: 420 });
    ctx.space.lastWindow.value = "7d";
    const w = mountWith(SpaceRefine, ctx);
    expect(w.find("select").element.value).toBe("");
    expect(w.findAll("input")[0]?.element.value).toBe("2026-10-01T00:00");
    expect(w.find(".fnote").text()).toBe(
      "Points are 7-minute maxima (Kp, fluxes), minima (Dst, Bz) and means over this window.",
    );
    const live = w.find("button");
    expect(live.attributes("disabled")).toBeUndefined();
    await live.trigger("click");
    expect(ctx.setSpaceRange).toHaveBeenLastCalledWith({ kind: "window", id: "7d" });
    ctx.zone.value = "local";
    await nextTick();
    expect(w.find(".fto").text()).toBe("from (local)");
    expect(w.findAll("input")[0]?.element.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    w.unmount();
  });
});
