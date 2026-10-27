import type { ApiError, ApiSunFrames } from "@tectonic/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../src/app.js";
import type { Db } from "../../src/db/client.js";
import { SUN_FRAME_RATE_MAX } from "../../src/routes/sun.js";
import { createSunCache, SDO_BASE, SOHO_BASE } from "../../src/space/sun.js";

const db = {} as unknown as Db;
const NOW = new Date("2026-10-27T03:00:00Z");
const MODIFIED = "Tue, 27 Oct 2026 02:43:06 GMT";
const urlOf = (input: string | URL | Request): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

function stubFetch(status = 200): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>().mockImplementation((input) => {
    const url = urlOf(input);
    if (status !== 200) return Promise.resolve(new Response("", { status }));
    return Promise.resolve(
      new Response(`frame:${url.replace(SDO_BASE, "").replace(SOHO_BASE, "")}`, {
        headers: { "content-type": "image/jpeg", "last-modified": MODIFIED },
      }),
    );
  });
}

describe("sun routes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers the manifest, cached a minute", async () => {
    const fetchFn = stubFetch();
    const sun = createSunCache({ fetch: fetchFn, userAgent: "test/1", now: () => NOW });
    const app = buildApp({ db, now: () => NOW, sun });
    const res = await app.inject({ method: "GET", url: "/api/space/sun" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=60");
    const body = res.json<ApiSunFrames>();
    expect(body.generatedAt).toBe("2026-10-27T03:00:00.000Z");
    expect(body.frames.map((f) => f.key)).toEqual([
      "aia193",
      "aia304",
      "aia171",
      "hmii",
      "hmib",
      "c2",
      "c3",
    ]);
    expect(body.frames[0]).toEqual({
      key: "aia193",
      time: "2026-10-27T02:43:06.000Z",
      bytes: "frame:latest_512_0193.jpg".length,
    });
    expect(fetchFn).toHaveBeenCalledTimes(7);
    await app.close();
  });

  it("serves a frame's bytes with its type, time and an hour's cache, under its own rate limit", async () => {
    const fetchFn = stubFetch();
    const sun = createSunCache({ fetch: fetchFn, userAgent: "test/1", now: () => NOW });
    const app = buildApp({ db, now: () => NOW, sun });
    const res = await app.inject({ method: "GET", url: "/api/space/sun/aia193/512.jpg?t=x" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.headers["last-modified"]).toBe(MODIFIED);
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
    expect(res.body).toBe("frame:latest_512_0193.jpg");
    const large = await app.inject({ method: "GET", url: "/api/space/sun/c3/1024.jpg" });
    expect(large.body).toBe("frame:c3/1024/latest.jpg");
    expect(SUN_FRAME_RATE_MAX).toBe(600);
    await app.close();
  });

  it("leaves the time header off a frame without one", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("f", { headers: { "content-type": "image/jpeg" } }));
    const app = buildApp({ db, sun: createSunCache({ fetch: fetchFn, userAgent: "test/1" }) });
    const res = await app.inject({ method: "GET", url: "/api/space/sun/c2/512.jpg" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["last-modified"]).toBeUndefined();
    await app.close();
  });

  it("404s an unknown frame or size and 502s when upstream is down", async () => {
    const sun = createSunCache({ fetch: stubFetch(503), userAgent: "test/1" });
    const app = buildApp({ db, sun });
    for (const url of ["/api/space/sun/aia999/512.jpg", "/api/space/sun/c2/256.jpg"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, url).toBe(404);
      expect(res.json<ApiError>().error).toBe("sun frame not found");
    }
    const down = await app.inject({ method: "GET", url: "/api/space/sun/c2/512.jpg" });
    expect(down.statusCode).toBe(502);
    expect(down.json<ApiError>()).toEqual({ error: "sun frame unavailable" });
    const manifest = await app.inject({ method: "GET", url: "/api/space/sun" });
    expect(manifest.statusCode).toBe(500);
    await app.close();
  });

  it("builds its own cache over the global fetch when none is injected", async () => {
    const fetchFn = stubFetch();
    vi.stubGlobal("fetch", fetchFn);
    const app = buildApp({ db });
    const res = await app.inject({ method: "GET", url: "/api/space/sun/hmii/512.jpg" });
    expect(res.statusCode).toBe(200);
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      "user-agent": "tectonic-desk/0.0 (+local)",
    });
    await app.close();
  });
});
