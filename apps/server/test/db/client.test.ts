import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { drainPool, type DrainablePool } from "../../src/db/client.js";

/** A pool whose clients report their close a few ticks after the pool has let go of them. */
function fakePool(totalCount: number): DrainablePool & { ended: boolean; removed: number } {
  const events = new EventEmitter();
  const pool = {
    totalCount,
    ended: false,
    removed: 0,
    on: (event: "remove", listener: () => void) => events.on(event, listener),
    end: () => {
      pool.ended = true;
      for (let i = 1; i <= totalCount; i++) {
        setTimeout(() => {
          pool.removed += 1;
          events.emit("remove");
        }, 5 * i);
      }
      return Promise.resolve();
    },
  };
  return pool;
}

describe("drainPool", () => {
  it("ends the pool and resolves only once every client has reported its close", async () => {
    const pool = fakePool(2);
    await drainPool(pool);
    expect(pool.ended).toBe(true);
    expect(pool.removed).toBe(2);
  });

  it("resolves at once when the pool holds no clients", async () => {
    const pool = fakePool(0);
    await drainPool(pool);
    expect(pool.ended).toBe(true);
    expect(pool.removed).toBe(0);
  });
});
