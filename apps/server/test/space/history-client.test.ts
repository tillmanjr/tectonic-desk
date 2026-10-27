import { afterEach, describe, expect, it, vi } from "vitest";
import { SpaceHttpError } from "../../src/space/client.js";
import {
  createHistoryClient,
  GFZ_BASE,
  KYOTO_BASE,
  serviceInstant,
} from "../../src/space/history-client.js";
import { dstCsv, dstInfo, gfzRaw } from "../support/history-stub.js";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const textResponse = (body: string): Response =>
  new Response(body, { headers: { "content-type": "text/csv" } });
const urlOf = (input: string | URL | Request): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

const FROM = new Date("2026-09-30T00:00:00Z");
const TO = new Date("2026-10-01T23:59:59Z");
const kpDoc = gfzRaw("Kp");
const kpRaw = { datetime: kpDoc.datetime, Kp: kpDoc.values, status: kpDoc.status };

describe("createHistoryClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks GFZ for one index between two instants with the agent and lifts the index out", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(kpRaw));
    const client = createHistoryClient({ fetch: fetchFn, userAgent: "test/1" });
    const doc = await client.fetchGfz("Kp", FROM, TO);
    expect(doc.index).toBe("Kp");
    expect(doc.values).toHaveLength(16);
    expect(doc.status?.[8]).toBe("pre");
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe(`${GFZ_BASE}?start=2026-09-30T00:00:00Z&end=2026-10-01T23:59:59Z&index=Kp`);
    expect(init?.headers).toEqual({ "user-agent": "test/1", accept: "application/json" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(serviceInstant(new Date("2026-10-26T12:34:56.789Z"))).toBe("2026-10-26T12:34:56Z");
  });

  it("turns a failed status into a SpaceHttpError", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 503));
    const client = createHistoryClient({ fetch: fetchFn, userAgent: "test/1" });
    const err = await client.fetchGfz("Ap", FROM, TO).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SpaceHttpError);
    expect(err).toMatchObject({ status: 503 });
  });

  it("reads the Dst dataset's range, then the data clipped to it", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = urlOf(input);
      if (url.includes("/info?")) return Promise.resolve(jsonResponse(dstInfo));
      return Promise.resolve(textResponse(dstCsv));
    });
    const client = createHistoryClient({
      fetch: fetchFn,
      userAgent: "test/1",
      kyotoBase: "https://k.test/hapi/",
    });
    expect(await client.fetchDstInfo()).toMatchObject({ startDate: "1957-01-01T00:29:30Z" });
    expect(fetchFn.mock.calls[0]?.[0]).toBe("https://k.test/hapi/info?id=hour_dst");
    // a range reaching before the start and past the stop is clipped to both
    const csv = await client.fetchDst(
      new Date("1900-01-01T00:00:00Z"),
      new Date("2100-01-01T00:00:00Z"),
    );
    expect(csv).toBe(dstCsv);
    const dataUrl = fetchFn.mock.calls[2]?.[0];
    expect(dataUrl).toBe(
      "https://k.test/hapi/data?id=hour_dst&parameters=dstValue,versionCode&time.min=1957-01-01T00:29:30Z&time.max=2026-10-27T02:29:30Z",
    );
    expect(fetchFn.mock.calls[2]?.[1]?.headers).toEqual({
      "user-agent": "test/1",
      accept: "text/csv",
    });
    // a range inside the dataset passes through unchanged
    await client.fetchDst(new Date("2024-01-01T00:00:00Z"), new Date("2025-01-01T00:00:00Z"));
    expect(fetchFn.mock.calls[4]?.[0]).toContain(
      "time.min=2024-01-01T00:00:00Z&time.max=2025-01-01T00:00:00Z",
    );
  });

  it("answers an empty string without a data request when the range misses the dataset", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(jsonResponse(dstInfo)));
    const client = createHistoryClient({ fetch: fetchFn, userAgent: "test/1" });
    expect(
      await client.fetchDst(new Date("1900-01-01T00:00:00Z"), new Date("1950-01-01T00:00:00Z")),
    ).toBe("");
    expect(
      await client.fetchDst(new Date("2030-01-01T00:00:00Z"), new Date("2031-01-01T00:00:00Z")),
    ).toBe("");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls.every((c) => urlOf(c[0]).startsWith(`${KYOTO_BASE}/info`))).toBe(
      true,
    );
  });

  it("aborts a request that outlives the timeout", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }),
    );
    const client = createHistoryClient({ fetch: fetchFn, userAgent: "test/1", timeoutMs: 5 });
    await expect(client.fetchGfz("SN", FROM, TO)).rejects.toThrow("aborted");
  });

  it("uses the global fetch by default", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(dstInfo));
    vi.stubGlobal("fetch", fetchFn);
    const client = createHistoryClient({ userAgent: "test/1" });
    await client.fetchDstInfo();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
