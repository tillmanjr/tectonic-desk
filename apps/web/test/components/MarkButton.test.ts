import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import MarkButton from "../../src/components/MarkButton.vue";
import type { MarkSubject } from "../../src/lib/marks.js";
import { makeContext, mountWith } from "../support/mount.js";

const subject: MarkSubject = {
  kind: "event",
  ref: "us1",
  frame: "wc",
  lon: -122,
  lat: 37,
  headline: "M5.5 mww",
  sub: "10 km N of Somewhere",
  stamp: "2026-10-13T10:00:00.000Z",
};

describe("MarkButton", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is disabled without a subject and does nothing when clicked", async () => {
    const ctx = await makeContext();
    const w = mountWith(MarkButton, ctx, { subject: null });
    expect(w.find("button.mark").attributes("disabled")).toBeDefined();
    expect(w.find("button.mark").text()).toBe("☆ Mark");
    expect(w.find("button.mark").attributes("title")).toBe("Mark this event");
    await w.find("button.mark").trigger("click");
    expect(w.find("input").exists()).toBe(false);
    w.unmount();
  });

  it("names and saves a mark of the current view, then shows the filled star", async () => {
    vi.useFakeTimers();
    const ctx = await makeContext();
    const w = mountWith(MarkButton, ctx, { subject });
    expect(w.find("button.mark").attributes("title")).toBe("Mark this earthquake");
    await w.find("button.mark").trigger("click");
    const input = w.find<HTMLInputElement>("input");
    expect(input.element.value).toBe("M5.5 mww · 10 km N of Somewhere");
    await input.setValue("My shock");
    const stop = vi.fn();
    await input.trigger("keydown", { key: "Enter", stopPropagation: stop });
    expect(stop).toHaveBeenCalled();
    expect(ctx.marks.marks.value[0]).toMatchObject({
      name: "My shock",
      url: "/wc?event=us1",
      kind: "event",
      ref: "us1",
    });
    expect(w.find("button.mark").text()).toBe("★ Mark");
    expect(w.find("button.mark").attributes("title")).toBe("Marked once");
    expect(w.find(".flash").text()).toBe("Marked");
    vi.advanceTimersByTime(2100);
    await nextTick();
    expect(w.find(".flash").exists()).toBe(false);
    ctx.marks.add({ ...subject, name: "again", url: "/" });
    await nextTick();
    expect(w.find("button.mark").attributes("title")).toBe("Marked 2 times");
    // a second save while the flash is up restarts the timer
    await w.find("button.mark").trigger("click");
    await w.find("button.save").trigger("click");
    await w.find("button.mark").trigger("click");
    await w.find("button.save").trigger("click");
    expect(ctx.marks.marks.value).toHaveLength(4);
    w.unmount();
  });

  it("cancels on Escape and Cancel without closing the panel", async () => {
    const ctx = await makeContext();
    const w = mountWith(MarkButton, ctx, { subject: { ...subject, kind: "volcano", ref: "1" } });
    expect(w.find("button.mark").attributes("title")).toBe("Mark this volcano");
    await w.find("button.mark").trigger("click");
    const stop = vi.fn();
    await w.find("input").trigger("keydown", { key: "Escape", stopPropagation: stop });
    expect(stop).toHaveBeenCalled();
    expect(w.find("input").exists()).toBe(false);
    await w.find("button.mark").trigger("click");
    await w.find("input").trigger("keydown", { key: "a" });
    await w.find("button.cancel").trigger("click");
    expect(w.find("input").exists()).toBe(false);
    expect(ctx.marks.marks.value).toHaveLength(0);
    w.unmount();
  });
});
