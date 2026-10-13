import { describe, expect, it, vi } from "vitest";
import { createUsgsClient, UsgsHttpError } from "../../src/usgs/client.js";

type FetchInput = Parameters<typeof globalThis.fetch>[0];

function fetchReturning(status: number, body: unknown, capture: Request[] = []) {
  return vi.fn((input: FetchInput, init?: RequestInit) => {
    capture.push(new Request(input, init));
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  });
}

const base = { baseUrl: "https://usgs.test", userAgent: "ua/1" };

describe("createUsgsClient", () => {
  it("builds the feed URL and sets headers", async () => {
    const reqs: Request[] = [];
    const fetch = fetchReturning(200, { features: [] }, reqs);
    const c = createUsgsClient({ ...base, fetch });
    const doc = await c.fetchFeed("2.5_day");
    expect(doc.features).toEqual([]);
    expect(reqs[0]?.url).toBe("https://usgs.test/earthquakes/feed/v1.0/summary/2.5_day.geojson");
    expect(reqs[0]?.headers.get("user-agent")).toBe("ua/1");
    expect(reqs[0]?.headers.get("accept")).toBe("application/json");
  });

  it("builds the detail URL and strips a trailing slash from the base", async () => {
    const reqs: Request[] = [];
    const fetch = fetchReturning(
      200,
      { id: "x", properties: { time: 1, updated: 1 }, geometry: { coordinates: [1, 2, 3] } },
      reqs,
    );
    const doc = await createUsgsClient({
      ...base,
      baseUrl: "https://usgs.test/",
      fetch,
    }).fetchDetail("us1");
    expect(doc.id).toBe("x");
    expect(reqs[0]?.url).toBe("https://usgs.test/fdsnws/event/1/query?eventid=us1&format=geojson");
  });

  it("builds the query URL with ISO times", async () => {
    const reqs: Request[] = [];
    const fetch = fetchReturning(200, { features: [] }, reqs);
    await createUsgsClient({ ...base, fetch }).fetchQuery({
      starttime: new Date("2026-09-01T00:00:00Z"),
      endtime: new Date("2026-10-01T00:00:00Z"),
      minmagnitude: 2.5,
      limit: 20000,
    });
    expect(reqs[0]?.url).toBe(
      "https://usgs.test/fdsnws/event/1/query?format=geojson&starttime=2026-09-01T00%3A00%3A00.000Z&endtime=2026-10-01T00%3A00%3A00.000Z&minmagnitude=2.5&orderby=time-asc&limit=20000",
    );
  });

  it("throws UsgsHttpError on non-2xx", async () => {
    const fetch = fetchReturning(503, { error: "nope" });
    const err: unknown = await createUsgsClient({ ...base, fetch })
      .fetchFeed("2.5_week")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UsgsHttpError);
    expect(err).toMatchObject({ status: 503 });
    expect(err instanceof UsgsHttpError && err.url).toContain("2.5_week");
  });

  it("rejects a payload that fails the schema", async () => {
    const fetch = fetchReturning(200, { nope: true });
    await expect(createUsgsClient({ ...base, fetch }).fetchFeed("2.5_day")).rejects.toThrow(
      /features/,
    );
  });

  it("aborts after the timeout", async () => {
    const fetch = vi.fn(
      (_input: FetchInput, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }),
    );
    const c = createUsgsClient({ ...base, fetch, timeoutMs: 10 });
    await expect(c.fetchFeed("2.5_day")).rejects.toThrow(/aborted/);
  });

  it("uses global fetch by default", () => {
    expect(() => createUsgsClient(base)).not.toThrow();
  });
});
