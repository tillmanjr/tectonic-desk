import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createVolcanoClient,
  decodeXml,
  GEONET_BASE,
  HANS_BASE,
  HANS_NOTICE_BASE,
  VolcanoHttpError,
  WEEKLY_REPORT_AGENT,
  WEEKLY_REPORT_MIRROR_URL,
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
  it("fetches the HANS lists, a notice, GeoNet and the weekly report with the right agents", async () => {
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
    expect(await c.fetchHansNoticeText("DOI-USGS-AVO-2026-10-16T19:06:04+00:00")).toContain("<rss");
    expect((await c.fetchGeonet()).features).toHaveLength(12);
    const weekly = await c.fetchWeeklyReport();
    expect(weekly.xml).toContain("<rss");
    expect(weekly.url).toBe(WEEKLY_REPORT_URL);
    expect(calls.map((x) => x.url)).toEqual([
      `${HANS_BASE}/getElevatedVolcanoes`,
      `${HANS_BASE}/getMonitoredVolcanoes`,
      `${HANS_NOTICE_BASE}/getNoticeFormatted/DOI-USGS-AVO-2026-10-16T19%3A06%3A04%2B00%3A00/text`,
      `${GEONET_BASE}/volcano/val`,
      WEEKLY_REPORT_URL,
    ]);
    expect(calls[0]?.agent).toBe("tectonic-test");
    expect(calls[0]?.accept).toBe("application/json");
    expect(calls[2]?.accept).toBe("text/plain");
    expect(calls[4]?.agent).toBe(WEEKLY_REPORT_AGENT);
  });

  it("falls back to the mirror when the feed refuses, and reports both when the mirror fails too", async () => {
    const { fetch, calls } = fakeFetch((url) =>
      url === WEEKLY_REPORT_URL
        ? new Response("blocked", { status: 403 })
        : new Response(weeklyRss, { status: 200 }),
    );
    const c = createVolcanoClient({ fetch, userAgent: "t" });
    expect(await c.fetchWeeklyReport()).toMatchObject({ url: WEEKLY_REPORT_MIRROR_URL });
    expect(calls.map((x) => [x.url, x.agent])).toEqual([
      [WEEKLY_REPORT_URL, WEEKLY_REPORT_AGENT],
      [WEEKLY_REPORT_MIRROR_URL, "t"],
    ]);
    const both = createVolcanoClient({
      fetch: fakeFetch(() => new Response("blocked", { status: 403 })).fetch,
      userAgent: "t",
    });
    await expect(both.fetchWeeklyReport()).rejects.toThrow(
      `${WEEKLY_REPORT_URL} answered 403; mirror: ${WEEKLY_REPORT_MIRROR_URL} answered 403`,
    );
    const alone = createVolcanoClient({ fetch, userAgent: "t", weeklyReportMirrorUrl: null });
    await expect(alone.fetchWeeklyReport()).rejects.toThrow(`${WEEKLY_REPORT_URL} answered 403`);
  });

  it("decodes the feed by its declared charset and rewrites the declaration", () => {
    const latin = new Uint8Array([
      ...new TextEncoder().encode('<?xml version="1.0" encoding="ISO-8859-1"?><rss>caf'),
      0xe9,
      ...new TextEncoder().encode("</rss>"),
    ]);
    expect(decodeXml(latin.buffer)).toBe('<?xml version="1.0" encoding="UTF-8"?><rss>café</rss>');
    const odd = new TextEncoder().encode('<?xml version="1.0" encoding="no-such"?><rss/>');
    expect(decodeXml(odd.buffer)).toBe('<?xml version="1.0" encoding="UTF-8"?><rss/>');
    const bare = new TextEncoder().encode("<rss>é</rss>");
    expect(decodeXml(bare.buffer)).toBe("<rss>é</rss>");
  });

  it("honours base overrides and trailing slashes", async () => {
    const { fetch, calls } = fakeFetch(() => json([]));
    const c = createVolcanoClient({
      fetch,
      userAgent: "t",
      hansBase: "http://h/",
      hansNoticeBase: "http://n/",
      geonetBase: "http://g/",
      weeklyReportUrl: "http://w/rss",
      weeklyReportMirrorUrl: null,
    });
    await c.fetchHansMonitored();
    await c.fetchHansNoticeText("a b");
    await c.fetchGeonet().catch(() => undefined);
    await c.fetchWeeklyReport();
    expect(calls.map((x) => x.url)).toEqual([
      "http://h/getMonitoredVolcanoes",
      "http://n/getNoticeFormatted/a%20b/text",
      "http://g/volcano/val",
      "http://w/rss",
    ]);
  });

  it("turns non-2xx answers into VolcanoHttpError and rejects bad shapes", async () => {
    const { fetch } = fakeFetch((url) =>
      url.includes("getNoticeFormatted")
        ? new Response("gone", { status: 404 })
        : json({ nope: 1 }),
    );
    const c = createVolcanoClient({ fetch, userAgent: "t" });
    await expect(c.fetchHansNoticeText("x")).rejects.toMatchObject({
      name: "VolcanoHttpError",
      status: 404,
      url: `${HANS_NOTICE_BASE}/getNoticeFormatted/x/text`,
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
