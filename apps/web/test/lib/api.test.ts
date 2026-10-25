import { describe, expect, it, vi } from "vitest";
import { ApiRequestError, createApiClient, errorMessage } from "../../src/lib/api.js";

function response(status: number, body: unknown, json = true): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => (json ? Promise.resolve(body) : Promise.reject(new Error("bad json"))),
  } as unknown as Response;
}

describe("createApiClient", () => {
  it("builds urls and returns parsed json", async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(200, { ok: 1 }));
    const api = createApiClient(fetchFn);
    await api.regions();
    await api.events({ since: "2026-10-06T00:00:00.000Z", minMag: 4.5, limit: 2000 });
    await api.events({ since: "2026-10-01", until: "2026-10-02", bbox: "-136,27,-104,53" });
    await api.summary({ since: "2026-10-01", until: "2026-10-02", minMag: 4.5 });
    await api.grid({ since: "2026-10-01", bbox: "-136,27,-104,53", cell: 0.5 });
    await api.event("us 1");
    await api.status();
    await api.geo("plates");
    await api.volcanoStatus();
    await api.volcanoChanges(7);
    await api.volcanoReports(4);
    await api.volcano(332010);
    await api.fields();
    await api.relief("0,0,10,0", 64);
    await api.spaceNow();
    await api.spaceWindow("2026-10-12T12:00:00.000Z", "2026-10-13T12:00:00.000Z");
    expect(fetchFn.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      "/api/regions",
      "/api/events?since=2026-10-06T00%3A00%3A00.000Z&minMag=4.5&limit=2000",
      "/api/events?since=2026-10-01&until=2026-10-02&bbox=-136%2C27%2C-104%2C53",
      "/api/events/summary?since=2026-10-01&until=2026-10-02&minMag=4.5",
      "/api/events/grid?since=2026-10-01&bbox=-136%2C27%2C-104%2C53&cell=0.5",
      "/api/events/us%201",
      "/api/status",
      "/api/geo/plates",
      "/api/volcanoes/status",
      "/api/volcanoes/changes?days=7",
      "/api/volcanoes/reports?weeks=4",
      "/api/volcanoes/332010",
      "/fields/fields.json",
      "/api/relief?section=0%2C0%2C10%2C0&n=64",
      "/api/space/now",
      "/api/space/window?from=2026-10-12T12%3A00%3A00.000Z&to=2026-10-13T12%3A00%3A00.000Z",
    ]);
  });
  it("throws ApiRequestError with the body's error message", async () => {
    const api = createApiClient(
      vi.fn().mockResolvedValue(response(404, { error: "event not found" })),
    );
    await expect(api.event("x")).rejects.toMatchObject({ status: 404, message: "event not found" });
  });
  it("falls back to the HTTP status for non-json or shapeless bodies", async () => {
    const a = createApiClient(vi.fn().mockResolvedValue(response(502, null, false)), "/x");
    await expect(a.status()).rejects.toMatchObject({ status: 502, message: "HTTP 502" });
    const b = createApiClient(vi.fn().mockResolvedValue(response(500, { nope: 1 })));
    await expect(b.status()).rejects.toBeInstanceOf(ApiRequestError);
    const c = createApiClient(vi.fn().mockResolvedValue(response(500, null)));
    await expect(c.status()).rejects.toMatchObject({ message: "HTTP 500" });
  });
});

describe("errorMessage", () => {
  it("reads Error messages and stringifies the rest", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("x")).toBe("x");
  });
});
