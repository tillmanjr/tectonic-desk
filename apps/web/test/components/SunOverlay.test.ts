import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import SunOverlay from "../../src/components/SunOverlay.vue";
import { makeContext, mountWith } from "../support/mount.js";

const key = (name: string): void => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: name, cancelable: true }));
};

describe("SunOverlay", () => {
  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("shows the large frame with its caption, credit and filmstrip, and steps or closes", async () => {
    const ctx = await makeContext({ space: true });
    const w = mountWith(SunOverlay, ctx, { open: null });
    const emitted = (): unknown[][] => w.findComponent(SunOverlay).emitted("update:open") ?? [];
    expect(w.find(".sunoverlay").exists()).toBe(false);
    expect(document.body.style.overflow).toBe("");

    await w.setProps({ open: "c2" });
    const box = w.find(".sunbox");
    expect(box.attributes("role")).toBe("dialog");
    expect(box.attributes("aria-modal")).toBe("true");
    expect(box.attributes("aria-label")).toBe("LASCO C2");
    expect(w.find("img.sunlarge").attributes("src")).toBe(
      "/api/space/sun/c2/1024.jpg?t=2026-10-13T11%3A45%3A00.000Z",
    );
    expect(w.find("img.sunlarge").attributes("alt")).toBe("LASCO C2, 2026-10-13 11:45 UTC");
    const caps = w.findAll(".suncap").map((c) => c.text());
    expect(caps[0]).toBe(
      "LASCO C2 · Corona from 1.5 to 6 solar radii, the disk occulted; CMEs leave here",
    );
    expect(caps[1]).toBe("2026-10-13 11:45 UTC · SOHO (ESA & NASA)");
    expect(document.body.style.overflow).toBe("hidden");
    await nextTick();
    expect(document.activeElement?.className).toBe("sunclose");
    const film = w.findAll(".sunfilmthumb");
    expect(film).toHaveLength(7);
    expect(film.map((f) => f.classes().includes("on"))).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      false,
    ]);
    expect(film[5]?.attributes("aria-pressed")).toBe("true");
    expect(film[0]?.find("img").attributes("src")).toBe(
      "/api/space/sun/aia193/512.jpg?t=2026-10-13T11%3A45%3A00.000Z",
    );

    // the filmstrip and the arrows change the frame; the ends wrap
    await film[0]?.trigger("click");
    expect(emitted().at(-1)).toEqual(["aia193"]);
    // the parent has not moved the prop, so the arrow steps from C2
    await w.find(".sunarrow.prev").trigger("click");
    expect(emitted().at(-1)).toEqual(["hmib"]);
    await w.setProps({ open: "c3" });
    expect(w.findAll(".suncap")[1]?.text()).toBe("time unknown · SOHO (ESA & NASA)");
    expect(w.find("img.sunlarge").attributes("src")).toBe("/api/space/sun/c3/1024.jpg?t=0");
    await w.find(".sunarrow.next").trigger("click");
    expect(emitted().at(-1)).toEqual(["aia193"]);
    await w.setProps({ open: "aia193" });
    expect(w.findAll(".suncap")[1]?.text()).toBe(
      "2026-10-13 11:45 UTC · Courtesy of NASA/SDO and the AIA, EVE, and HMI science teams",
    );

    // keys
    const before = emitted().length;
    key("ArrowRight");
    expect(emitted().at(-1)).toEqual(["aia304"]);
    key("ArrowLeft");
    expect(emitted().at(-1)).toEqual(["c3"]);
    key("Enter");
    expect(emitted()).toHaveLength(before + 2);
    key("Escape");
    expect(emitted().at(-1)).toEqual([null]);

    // a click on the box stays, on the backdrop or the × closes
    await w.find(".sunbox").trigger("click");
    expect(emitted()).toHaveLength(before + 3);
    await w.find(".sunoverlay").trigger("click");
    expect(emitted().at(-1)).toEqual([null]);
    await w.find(".sunclose").trigger("click");
    expect(emitted()).toHaveLength(before + 5);

    await w.setProps({ open: null });
    expect(w.find(".sunoverlay").exists()).toBe(false);
    expect(document.body.style.overflow).toBe("");
    key("ArrowRight");
    expect(emitted()).toHaveLength(before + 5);
    w.unmount();
  });

  it("restores the page's scroll when unmounted while open, and opens straight away when mounted open", async () => {
    const ctx = await makeContext({ space: true });
    const w = mountWith(SunOverlay, ctx, { open: "hmib" });
    expect(w.find(".sunbox").attributes("aria-label")).toBe("HMI magnetogram");
    expect(document.body.style.overflow).toBe("hidden");
    w.unmount();
    expect(document.body.style.overflow).toBe("");
    key("Escape");
  });
});
