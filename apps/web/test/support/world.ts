import { vi } from "vitest";
import { squareTopology } from "./events.js";

/** Stubs the global fetch used for the world-atlas chunk. */
export function stubWorld(ok = true): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 503,
      json: () => Promise.resolve(squareTopology),
    }),
  );
}
