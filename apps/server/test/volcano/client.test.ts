import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createVolcanoClient,
  GEONET_BASE,
  HANS_BASE,
  VolcanoHttpError,
  WEEKLY_REPORT_AGENT,
  WEEKLY_REPORT_URL,
} from "../../src/volcano/client.js";
import { geonetVal, hansElevated, weeklyRss } from "../support/volcano-stub.js";

interface Call {
  url: string;
  agent: string | null;
  accept: string | null;
}

function fakeFetch(answer: (url: string) => Response | Error): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const f: typeof fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers);
    calls.push({ url, agent: headers.get("user-agent"), accept: headers.get("accept") });
    const a = answer(url);
    return a instanceof Error ? Promise.reject(a) : Promise.resolve(a);
  };
  return { fetch: f, calls };
}

const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });

describe("createVolcanoClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("uses the global fetch by default", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(json([])));
    const c = createVolcanoClient({ userAgent: "t" });
    expect(await c.fetchHansMonitored()).toEqual([]);
  });
  it("fetches the HANS lists, GeoNet and the weekly report with the right agents", async () => {
    const { fetch, calls } = fakeFetch((url) => {
      if (url.endsWith("/getElevatedVolcanoes")) return json(hansElevated);
      if (url.endsWith("/getMonitoredVolcanoes")) return json([]);
      if (url.endsWith("/volcano/val")) return json(geonetVal);
      return new Response(weeklyRss, {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      });
    });
    const c = createVolcanoClient({ fetch, userAgent: "tectonic-test" });
    expect(await c.fetchHansElevated()).toHaveLength(4);
    expect(await c.fetchHansMonitored()).toEqual([]);
    expect((await c.fetchGeonet()).features).toHaveLength(12);
    expect(await c.fetchWeeklyReport()).toContain("<rss");
    expect(calls.map((x) => x.url)).toEqual([
      `${HANS_BASE}/getElevatedVolcanoes`,
      `${HANS_BASE}/getMonitoredVolcanoes`,
      `${GEONET_BASE}/volcano/val`,
      WEEKLY_REPORT_URL,
    ]);
    expect(calls[0]?.agent).toBe("tectonic-test");
    expect(calls[0]?.accept).toBe("application/json");
    expect(calls[3]?.agent).toBe(WEEKLY_REPORT_AGENT);
  });

  it("honours base overrides and trailing slashes", async () => {
    const { fetch, calls } = fakeFetch(() => json([]));
    const c = createVolcanoClient({
      fetch,
      userAgent: "t",
      hansBase: "http://h/",
      geonetBase: "http://g/",
      weeklyReportUrl: "http://w/rss",
    });
    await c.fetchHansMonitored();
    await c.fetchGeonet().catch(() => undefined);
    await c.fetchWeeklyReport();
    expect(calls.map((x) => x.url)).toEqual([
      "http://h/getMonitoredVolcanoes",
      "http://g/volcano/val",
      "http://w/rss",
    ]);
  });

  it("turns non-2xx answers into VolcanoHttpError and rejects bad shapes", async () => {
    const { fetch } = fakeFetch((url) =>
      url.includes("WeeklyVolcanoRSS")
        ? new Response("blocked", { status: 403 })
        : json({ nope: 1 }),
    );
    const c = createVolcanoClient({ fetch, userAgent: "t" });
    await expect(c.fetchWeeklyReport()).rejects.toMatchObject({
      name: "VolcanoHttpError",
      status: 403,
      url: WEEKLY_REPORT_URL,
    });
    await expect(c.fetchHansElevated()).rejects.toThrow();
    expect(new VolcanoHttpError(500, "u").message).toBe("u answered 500");
  });

  it("aborts a request that outlives the timeout", async () => {
    const f: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    const c = createVolcanoClient({ fetch: f, userAgent: "t", timeoutMs: 1 });
    await expect(c.fetchGeonet()).rejects.toThrow("aborted");
  });
});
