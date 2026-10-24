import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFields, rasterFor, resetFieldsCache, viewOf } from "../../src/lib/fields.js";
import { fakeApi } from "../support/api.js";
import { fieldsFile } from "../support/fields.js";

describe("fields", () => {
  afterEach(() => {
    resetFieldsCache();
  });

  it("fetches the file once and shares it, forgetting a failure so the next call retries", async () => {
    const api = fakeApi();
    expect(await loadFields(api)).toBe(fieldsFile);
    expect(await loadFields(api)).toBe(fieldsFile);
    expect(api.fields).toHaveBeenCalledTimes(1);
    resetFieldsCache();
    const failing = fakeApi({ fields: vi.fn().mockRejectedValueOnce(new Error("down")) });
    await expect(loadFields(failing)).rejects.toThrow("down");
    vi.mocked(failing.fields).mockResolvedValue(fieldsFile);
    expect(await loadFields(failing)).toBe(fieldsFile);
    expect(failing.fields).toHaveBeenCalledTimes(2);
  });

  it("names the view for a frame and picks the raster for a choice", () => {
    expect(viewOf(true)).toBe("global");
    expect(viewOf(false)).toBe("wc");
    expect(rasterFor(fieldsFile, "gravity", "wc")?.src).toBe("/fields/gravity-wc.png");
    expect(rasterFor(fieldsFile, "magnetic", "global")?.units).toBe("nT");
    expect(rasterFor(fieldsFile, "magnetic", "wc")).toBeNull();
    expect(rasterFor(fieldsFile, "none", "global")).toBeNull();
    expect(rasterFor(null, "gravity", "global")).toBeNull();
  });
});
