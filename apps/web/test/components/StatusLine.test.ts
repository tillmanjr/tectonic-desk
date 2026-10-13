import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import StatusLine from "../../src/components/StatusLine.vue";
import { fakeApi, status } from "../support/api.js";
import { makeContext, mountWith } from "../support/mount.js";

describe("StatusLine", () => {
  it("shows a live line with the feed age and catalog totals", async () => {
    const ctx = await makeContext();
    const w = mountWith(StatusLine, ctx);
    expect(w.text()).toContain("Live · USGS ComCat · feed synced 2026-10-13 11:55 UTC · 5 min ago");
    expect(w.text()).toContain("7,269 events since 2026-07-15 · 692 solutions");
    expect(w.find(".status").classes()).not.toContain("warn");
  });
  it("turns amber when the last sync is older than 30 minutes or missing", async () => {
    const stale = await makeContext({
      api: fakeApi({
        status: vi
          .fn()
          .mockResolvedValue(status({ lastSuccessfulFeed: "2026-10-13T11:00:00.000Z" })),
      }),
    });
    expect(mountWith(StatusLine, stale).find(".status").classes()).toContain("warn");
    const none = await makeContext({
      api: fakeApi({
        status: vi.fn().mockResolvedValue(
          status({
            lastSuccessfulFeed: null,
            events: { total: 0, newest: null, oldest: null, withMechanism: 0 },
          }),
        ),
      }),
    });
    const w = mountWith(StatusLine, none);
    expect(w.text()).toContain("no feed sync yet");
    expect(w.text()).toContain("0 events · 692 solutions");
  });
  it("turns red while the API is unreachable and shows connecting before the first answer", async () => {
    const ctx = await makeContext();
    const w = mountWith(StatusLine, ctx);
    vi.mocked(ctx.api.status).mockRejectedValueOnce(new Error("down"));
    await ctx.status.poll();
    await nextTick();
    expect(w.find(".status").classes()).toContain("bad");
    expect(w.text()).toContain("API unreachable since 12:00 UTC");
    ctx.status.status.value = null;
    ctx.status.errorSince.value = null;
    await nextTick();
    expect(w.text()).toContain("Connecting");
    expect(w.findAll("span")).toHaveLength(1);
  });
});
