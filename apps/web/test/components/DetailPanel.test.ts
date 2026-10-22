import { flushPromises } from "@vue/test-utils";
import type { ApiEventDetail } from "@tectonic/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import DetailPanel from "../../src/components/DetailPanel.vue";
import { ApiRequestError } from "../../src/lib/api.js";
import { fakeApi } from "../support/api.js";
import { stubCanvas } from "../support/canvas.js";
import { event, mech } from "../support/events.js";
import { makeContext, mountWith, type Context } from "../support/mount.js";

const main = event({
  id: "main",
  mag: 7.2,
  time: "2026-10-10T00:00:00Z",
  latitude: 0,
  longitude: 0,
  alert: "yellow",
  sig: 900,
  felt: 120,
  cdi: 6.1,
  mmi: 7.3,
  tsunami: true,
  status: "reviewed",
});
const after = event({
  id: "after",
  mag: 5.0,
  time: "2026-10-10T05:00:00Z",
  latitude: 0.4,
  longitude: 0,
});
const after2 = event({
  id: "after2",
  mag: 4.8,
  time: "2026-10-10T06:00:00Z",
  latitude: -0.4,
  longitude: 0,
});
const detailOf = (
  e: ReturnType<typeof event>,
  over: Partial<ApiEventDetail> = {},
): ApiEventDetail => ({
  ...e,
  firstSeen: "2026-10-10T00:05:00.000Z",
  lastSeen: "2026-10-12T00:00:00.000Z",
  detailCheckedUpdated: null,
  usgs: {},
  ...over,
});
/** Visible text with a space at every element boundary. */
const text = (w: { html: () => string }) =>
  w
    .html()
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function panel(over: Partial<Context> = {}, list = [main, after]) {
  const api = fakeApi({
    events: vi
      .fn()
      .mockResolvedValue({ events: list, count: list.length, truncated: false, query: {} }),
  });
  const ctx = { ...(await makeContext({ api })), ...over };
  return { ctx, w: mountWith(DetailPanel, ctx) };
}

describe("DetailPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is closed without a selection and opens with the fetched detail", async () => {
    stubCanvas();
    const { ctx, w } = await panel();
    expect(w.find(".detail").classes()).not.toContain("open");
    expect(w.find(".detail").attributes("aria-hidden")).toBe("true");
    vi.mocked(ctx.api.event).mockResolvedValue(
      detailOf(main, {
        mechanisms: [
          mech({ id: 1 }),
          mech({ id: 2, source: "nc", preferred: false, kind: "fm" }),
          mech({
            id: 3,
            source: "gcmt",
            preferred: false,
            strike1: null,
            dip1: null,
            rake1: null,
            strike2: null,
            dip2: null,
            rake2: null,
            tAzimuth: null,
          }),
        ],
      }),
    );
    ctx.catalog.select("main");
    await flushPromises();
    const t = text(w);
    expect(w.find(".detail").classes()).toContain("open");
    expect(w.find(".mag").text()).toContain("M7.2");
    expect(t).toContain("2026-10-10 00:00:00 UTC");
    expect(t).toContain("3.5 d ago");
    ctx.zone.value = "local";
    await flushPromises();
    expect(text(w)).toContain("2026-10-10 00:00 UTC · 3.5 d ago");
    ctx.zone.value = "utc";
    await flushPromises();
    expect(t).toContain("0.000°N, 0.000°E");
    await w.find(".markrow button.mark").trigger("click");
    await w.find(".markrow input").trigger("keydown", { key: "Enter" });
    expect(ctx.marks.marks.value[0]).toMatchObject({
      kind: "event",
      ref: "main",
      frame: "world",
      url: "/wc?event=us1",
    });
    expect(t).toContain("195.2 km · intermediate (70–300 km)");
    expect(t).toContain("Moment tensor");
    expect(t).toContain("Other solutions");
    expect(t).toContain("nc FM");
    expect(t).toContain("gcmt MT");
    expect(t).toContain("no geometry published");
    expect(t).toContain("Oblique Normal · 13/69/-126 and 256/41/-34");
    expect(t).toContain("Significance 900");
    expect(t).toContain("DYFI reports 120");
    expect(t).toContain("Max CDI (DYFI) 6.1");
    expect(t).toContain("Max MMI (ShakeMap) 7.3");
    expect(t).toContain("PAGER alert YELLOW");
    expect(t).toContain("Tsunami flag Set");
    expect(t).toContain("1 later event ≥M4.5 within 150 km in the 84 h to now; largest M5.0");
    expect(t).toContain("Review status reviewed");
    expect(t).toContain("First seen here 2026-10-10 00:05 UTC");
    expect(
      w.find("a[href='https://earthquake.usgs.gov/earthquakes/eventpage/main']").exists(),
    ).toBe(true);
    await w.find(".close").trigger("click");
    expect(ctx.select).toHaveBeenCalledWith(null);
  });

  it("pluralises the sequence note", async () => {
    const { ctx, w } = await panel({}, [main, after, after2]);
    vi.mocked(ctx.api.event).mockResolvedValue(detailOf(main));
    ctx.catalog.select("main");
    await flushPromises();
    expect(text(w)).toContain(
      "2 later events ≥M4.5 within 150 km in the 84 h to now; largest M5.0",
    );
  });

  it("links to the parent mainshock, closes on Escape, and shows the no-solution notes", async () => {
    const { ctx, w } = await panel();
    vi.mocked(ctx.api.event).mockResolvedValue(
      detailOf(after, {
        mechanisms: [
          mech({ id: 8, kind: "fm" }),
          mech({
            id: 9,
            preferred: false,
            strike1: null,
            dip1: null,
            rake1: null,
            strike2: null,
            dip2: null,
            rake2: null,
            planesReconstructed: true,
          }),
        ],
      }),
    );
    ctx.catalog.select("after");
    await flushPromises();
    const t = text(w);
    expect(t).toContain("Within 150 km of, and after, the M7.2 event of 2026-10-10 00:00 UTC.");
    expect(t).toContain("Other solutions");
    expect(t).toContain("· reconstructed");
    expect(t).toContain("Focal mechanism (first motion)");
    await w.find("a.parent").trigger("click");
    expect(ctx.select).toHaveBeenCalledWith("main");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(ctx.select).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(ctx.select).toHaveBeenCalledWith(null);
    vi.mocked(ctx.api.event).mockResolvedValue(detailOf(event({ id: "y" })));
    ctx.catalog.select("y");
    await flushPromises();
    expect(text(w)).toContain("USGS lists a moment-tensor product for this event");
    vi.mocked(ctx.api.event).mockResolvedValue(
      detailOf(
        event({
          id: "x",
          types: ["origin"],
          depthKm: null,
          status: null,
          eventType: "quarry blast",
          magType: null,
          alert: null,
          sig: null,
        }),
      ),
    );
    ctx.catalog.select("x");
    await flushPromises();
    const t2 = text(w);
    expect(t2).toContain(
      "USGS has not published a moment tensor or focal mechanism for this event.",
    );
    expect(t2).toContain("depth not reported");
    expect(t2).toContain("Review status —");
    expect(t2).toContain("quarry blast");
    expect(t2).not.toContain("Impact");
  });

  it("shows the list event while loading, then not found, errors with retry, and ignores stale answers", async () => {
    const { ctx, w } = await panel();
    let resolveFirst: (v: ApiEventDetail) => void = () => undefined;
    vi.mocked(ctx.api.event)
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolveFirst = r;
          }),
      )
      .mockRejectedValueOnce(new ApiRequestError(404, "event not found"))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(detailOf(after));
    ctx.catalog.select("main");
    await flushPromises();
    expect(w.find(".mag").text()).toContain("M7.2");
    expect(w.text()).toContain("Loading");
    ctx.catalog.select("gone");
    await flushPromises();
    expect(w.text()).toContain("Event not found in the catalog");
    expect(w.find(".mag").text()).toContain("gone");
    resolveFirst(detailOf(main));
    await flushPromises();
    expect(w.text()).toContain("Event not found in the catalog");
    ctx.catalog.select("after");
    await flushPromises();
    expect(w.text()).toContain("boom");
    await w.find("button.retry").trigger("click");
    await flushPromises();
    expect(w.text()).toContain("Within 150 km of");
  });

  it("drops a stale failure, closes cleanly, ignores Escape when closed, and unmounts", async () => {
    const { ctx, w } = await panel();
    let rejectFirst: (e: Error) => void = () => undefined;
    vi.mocked(ctx.api.event)
      .mockImplementationOnce(
        () =>
          new Promise((_, r) => {
            rejectFirst = r;
          }),
      )
      .mockResolvedValueOnce(detailOf(after));
    ctx.catalog.select("main");
    await flushPromises();
    ctx.catalog.select("after");
    await flushPromises();
    rejectFirst(new Error("late"));
    await flushPromises();
    expect(w.text()).not.toContain("late");
    ctx.catalog.select(null);
    await flushPromises();
    expect(w.find(".detail").classes()).not.toContain("open");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(ctx.select).not.toHaveBeenCalled();
    w.unmount();
  });
});
