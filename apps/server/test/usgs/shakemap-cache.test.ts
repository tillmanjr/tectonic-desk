import { describe, expect, it } from "vitest";
import { z } from "zod";
import { UsgsHttpError } from "../../src/usgs/client.js";
import { detailDocumentSchema } from "../../src/usgs/schema.js";
import { createShakeMapCache } from "../../src/usgs/shakemap-cache.js";
import { COVERAGE_FILE } from "../../src/usgs/shakemap.js";
import { loadFixture, recordingLogger } from "../support/fixtures.js";
import { stubUsgs } from "../support/usgs-stub.js";

const detail = loadFixture("shakemap_detail.json", detailDocumentSchema);
const coverage = loadFixture("shakemap_coverage.json", z.unknown());
const coverageUrl = z
  .object({ url: z.string() })
  .parse(
    z
      .object({ contents: z.record(z.string(), z.unknown()) })
      .parse(detail.properties.products?.shakemap?.[0]).contents[COVERAGE_FILE],
  ).url;
const noShake = { ...detail, properties: { ...detail.properties, products: {} } };

function clock(start = 0): { now: () => Date; advance: (ms: number) => void } {
  let t = start;
  return {
    now: () => new Date(t),
    advance: (ms) => {
      t += ms;
    },
  };
}

describe("createShakeMapCache", () => {
  it("reads the detail and the coverage once, then serves the copy until the ttl runs out", async () => {
    const usgs = stubUsgs({ details: { us1: detail }, urls: { [coverageUrl]: coverage } });
    const c = clock();
    const cache = createShakeMapCache({ usgs, ttlMs: 1000, now: c.now });
    const [a, b] = await Promise.all([cache.get("us1"), cache.get("us1")]);
    expect(a?.eventId).toBe("us1");
    expect(a?.grid.nx).toBe(11);
    expect(b).toBe(a);
    expect(usgs.calls.detail).toEqual(["us1"]);
    expect(usgs.calls.json).toEqual([coverageUrl]);
    c.advance(999);
    expect(await cache.get("us1")).toBe(a);
    expect(usgs.calls.detail).toHaveLength(1);
    c.advance(1);
    await cache.get("us1");
    expect(usgs.calls.detail).toHaveLength(2);
  });

  it("answers null for an event without a ShakeMap or unknown to USGS, and caches that", async () => {
    const usgs = stubUsgs({
      details: { bare: noShake, gone: new UsgsHttpError(404, "https://usgs.test/x") },
    });
    const cache = createShakeMapCache({ usgs });
    expect(await cache.get("bare")).toBeNull();
    expect(await cache.get("gone")).toBeNull();
    expect(await cache.get("bare")).toBeNull();
    expect(usgs.calls.detail).toEqual(["bare", "gone"]);
    expect(usgs.calls.json).toEqual([]);
  });

  it("throws on a failure with no copy, and serves the last copy (retried once per ttl) after one", async () => {
    const details: Record<string, typeof detail | Error> = { us1: new UsgsHttpError(503, "u") };
    const usgs = stubUsgs({ details, urls: { [coverageUrl]: coverage } });
    const c = clock();
    const log = recordingLogger();
    const cache = createShakeMapCache({ usgs, ttlMs: 1000, now: c.now, log });
    await expect(cache.get("us1")).rejects.toThrow(/503/);
    details.us1 = detail;
    const first = await cache.get("us1");
    details.us1 = new Error("network");
    c.advance(1000);
    expect(await cache.get("us1")).toEqual(first);
    expect(log.entries.map((e) => e.msg)).toEqual([
      "shakemap refresh failed; serving the last copy",
    ]);
    c.advance(500);
    await cache.get("us1");
    expect(usgs.calls.detail).toHaveLength(3);
  });

  it("serves a stale copy without a logger, and drops the least recently fetched past the cap", async () => {
    const details: Record<string, typeof noShake | Error> = { a: noShake, b: noShake, c: noShake };
    const usgs = stubUsgs({ details });
    const c = clock();
    const cache = createShakeMapCache({ usgs, ttlMs: 1000, maxEntries: 2, now: c.now });
    await cache.get("a");
    await cache.get("b");
    await cache.get("c");
    await cache.get("b");
    expect(usgs.calls.detail).toEqual(["a", "b", "c"]);
    await cache.get("a");
    expect(usgs.calls.detail).toEqual(["a", "b", "c", "a"]);
    details.c = new Error("down");
    c.advance(1000);
    expect(await cache.get("c")).toBeNull();
  });

  it("uses the real clock and defaults", async () => {
    const usgs = stubUsgs({ details: { a: noShake } });
    const cache = createShakeMapCache({ usgs });
    expect(await cache.get("a")).toBeNull();
    expect(await cache.get("a")).toBeNull();
    expect(usgs.calls.detail).toEqual(["a"]);
  });
});
