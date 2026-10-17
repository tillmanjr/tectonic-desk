import { describe, expect, it } from "vitest";
import { DEFAULT_GEO_DIR, GEO_NAMES, loadGeoAssets } from "../../src/geo/assets.js";

describe("loadGeoAssets", () => {
  it("loads every geo file with quoted sha1 ETags", () => {
    const assets = loadGeoAssets();
    expect([...assets.keys()]).toEqual([...GEO_NAMES]);
    for (const name of GEO_NAMES) {
      const a = assets.get(name);
      expect(a?.body.length).toBeGreaterThan(1000);
      expect(a?.etag).toMatch(/^"[0-9a-f]{40}"$/);
      expect(() => {
        JSON.parse(a?.body.toString("utf8") ?? "");
      }).not.toThrow();
    }
    expect(DEFAULT_GEO_DIR).toMatch(/data[\\/]geo[\\/]$/);
  });

  it("throws when a file is missing", () => {
    expect(() => loadGeoAssets("/nonexistent/dir")).toThrow(/ENOENT/);
  });
});
