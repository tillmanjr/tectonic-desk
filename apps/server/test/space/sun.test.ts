import { describe, expect, it, vi } from "vitest";
import { SpaceHttpError } from "../../src/space/client.js";
import { createSunCache, SDO_BASE, SOHO_BASE, sunUrl } from "../../src/space/sun.js";
import { recordingLogger } from "../support/fixtures.js";

const MODIFIED = "Tue, 27 Oct 2026 02:43:06 GMT";
const jpeg = (text: string, modified: string | null = MODIFIED): Response =>
  new Response(text, {
    status: 200,
    headers: {
      "content-type": "image/jpeg",
      ...(modified === null ? {} : { "last-modified": modified }),
    },
  });
const urlOf = (input: string | URL | Request): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

describe("sunUrl", () => {
  it("names SDO's latest files by channel code and SOHO's by directory", () => {
    expect(sunUrl("aia193", 512)).toBe(`${SDO_BASE}latest_512_0193.jpg`);
    expect(sunUrl("aia304", 1024)).toBe(`${SDO_BASE}latest_1024_0304.jpg`);
    expect(sunUrl("aia171", 512)).toBe(`${SDO_BASE}latest_512_0171.jpg`);
    expect(sunUrl("hmii", 1024)).toBe(`${SDO_BASE}latest_1024_HMIIC.jpg`);
    expect(sunUrl("hmib", 512)).toBe(`${SDO_BASE}latest_512_HMIB.jpg`);
    expect(sunUrl("c2", 512)).toBe(`${SOHO_BASE}c2/512/latest.jpg`);
    expect(sunUrl("c3", 1024)).toBe(`${SOHO_BASE}c3/1024/latest.jpg`);
  });
});

describe("createSunCache", () => {
  it("fetches a frame with the agent, keeps it for the ttl, and fetches again after", async () => {
    let t = Date.parse("2026-10-27T03:00:00Z");
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(jpeg("one")));
    const cache = createSunCache({
      fetch: fetchFn,
      userAgent: "test/1",
      ttlMs: 1000,
      now: () => new Date(t),
    });
    const a = await cache.get("aia193", 512);
    expect(a.bytes.toString()).toBe("one");
    expect(a.contentType).toBe("image/jpeg");
    expect(a.lastModified).toEqual(new Date(MODIFIED));
    expect(a.fetchedAt).toEqual(new Date(t));
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe(sunUrl("aia193", 512));
    expect(init?.headers).toEqual({ "user-agent": "test/1", accept: "image/jpeg" });
    t += 999;
    expect(await cache.get("aia193", 512)).toBe(a);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    // another size is another copy
    await cache.get("aia193", 1024);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    t += 1;
    fetchFn.mockImplementation(() => Promise.resolve(jpeg("two", null)));
    const b = await cache.get("aia193", 512);
    expect(b.bytes.toString()).toBe("two");
    expect(b.lastModified).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(3);
    // a body without a content type is taken as JPEG
    fetchFn.mockImplementation(() => Promise.resolve(new Response(new Uint8Array([1, 2]))));
    expect((await cache.get("hmii", 512)).contentType).toBe("image/jpeg");
  });

  it("shares one download between concurrent callers", async () => {
    let release: ((r: Response) => void) | undefined;
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const cache = createSunCache({ fetch: fetchFn, userAgent: "test/1" });
    const p1 = cache.get("c2", 512);
    const p2 = cache.get("c2", 512);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    release?.(jpeg("c2"));
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBe(b);
    expect(a.bytes.toString()).toBe("c2");
  });

  it("serves the last copy with a warning when upstream fails, and throws without one", async () => {
    let t = 0;
    const log = recordingLogger();
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(jpeg("good"));
    const cache = createSunCache({
      fetch: fetchFn,
      userAgent: "test/1",
      ttlMs: 1000,
      now: () => new Date(t),
      log,
    });
    await cache.get("hmib", 512);
    t = 5000;
    fetchFn.mockResolvedValue(new Response("", { status: 503 }));
    const stale = await cache.get("hmib", 512);
    expect(stale.bytes.toString()).toBe("good");
    expect(stale.fetchedAt).toEqual(new Date(5000));
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]?.obj).toMatchObject({
      key: "hmib",
      size: 512,
      err: expect.any(SpaceHttpError),
    });
    // served as fresh again until the ttl passes, so a dead upstream is not hammered
    await cache.get("hmib", 512);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const err = await cache.get("c3", 512).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SpaceHttpError);
    expect(err).toMatchObject({ status: 503 });
  });

  it("describes the seven thumbnails in catalogue order", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = urlOf(input);
      return Promise.resolve(
        jpeg(url.includes("c3") ? "three" : "x", url.includes("c2") ? null : MODIFIED),
      );
    });
    const cache = createSunCache({ fetch: fetchFn, userAgent: "test/1" });
    const metas = await cache.metas();
    expect(metas.map((m) => m.key)).toEqual([
      "aia193",
      "aia304",
      "aia171",
      "hmii",
      "hmib",
      "c2",
      "c3",
    ]);
    expect(metas[0]).toEqual({ key: "aia193", time: new Date(MODIFIED), bytes: 1 });
    expect(metas[5]?.time).toBeNull();
    expect(metas[6]?.bytes).toBe(5);
    expect(fetchFn).toHaveBeenCalledTimes(7);
    expect(fetchFn.mock.calls.every((c) => urlOf(c[0]).includes("512"))).toBe(true);
    await cache.metas();
    expect(fetchFn).toHaveBeenCalledTimes(7);
  });

  it("aborts a download that outlives the timeout", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }),
    );
    const cache = createSunCache({ fetch: fetchFn, userAgent: "test/1", timeoutMs: 5 });
    await expect(cache.get("aia304", 1024)).rejects.toThrow("aborted");
  });

  it("uses the global fetch and a real clock by default", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jpeg("g"));
    vi.stubGlobal("fetch", fetchFn);
    try {
      const cache = createSunCache({ userAgent: "test/1" });
      const img = await cache.get("c3", 512);
      expect(img.bytes.toString()).toBe("g");
      expect(Math.abs(img.fetchedAt.getTime() - Date.now())).toBeLessThan(5000);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
