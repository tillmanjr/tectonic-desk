import { describe, expect, it, vi } from "vitest";
import {
  createSpaceClient,
  SpaceHttpError,
  SWPC_BASE,
  SWPC_FILES,
} from "../../src/space/client.js";
import { kp1m, scales } from "../support/space-stub.js";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("createSpaceClient", () => {
  it("fetches each file under the base with the agent and parses it", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith(SWPC_FILES.fetchKp1m)) return Promise.resolve(jsonResponse(kp1m));
      if (url.endsWith(SWPC_FILES.fetchScales)) return Promise.resolve(jsonResponse(scales));
      return Promise.resolve(jsonResponse([]));
    });
    const client = createSpaceClient({ fetch: fetchFn, userAgent: "test/1" });
    expect(await client.fetchKp1m()).toHaveLength(6);
    expect(await client.fetchScales()).toHaveProperty("0");
    expect(await client.fetchKp3h()).toEqual([]);
    expect(await client.fetchKpForecast()).toEqual([]);
    expect(await client.fetchDst()).toEqual([]);
    expect(await client.fetchMag()).toEqual([]);
    expect(await client.fetchWind()).toEqual([]);
    expect(await client.fetchXrays()).toEqual([]);
    expect(await client.fetchProtons()).toEqual([]);
    expect(await client.fetchFlares()).toEqual([]);
    expect(await client.fetchAlerts()).toEqual([]);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe(`${SWPC_BASE}/json/planetary_k_index_1m.json`);
    expect(init?.headers).toEqual({ "user-agent": "test/1", accept: "application/json" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("honours a custom base, throws SpaceHttpError on a bad status and rejects a wrong shape", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "nope" }, 503))
      .mockResolvedValueOnce(jsonResponse({ not: "an array" }));
    const client = createSpaceClient({
      fetch: fetchFn,
      userAgent: "test/1",
      base: "http://mirror.test/swpc/",
    });
    const err = await client.fetchDst().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SpaceHttpError);
    if (!(err instanceof SpaceHttpError)) throw new Error("expected SpaceHttpError");
    expect(err.status).toBe(503);
    expect(err.url).toBe("http://mirror.test/swpc/products/kyoto-dst.json");
    expect(err.message).toBe("http://mirror.test/swpc/products/kyoto-dst.json answered 503");
    await expect(client.fetchDst()).rejects.toThrow();
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
    const client = createSpaceClient({ fetch: fetchFn, userAgent: "test/1", timeoutMs: 5 });
    await expect(client.fetchAlerts()).rejects.toThrow("aborted");
  });
});
