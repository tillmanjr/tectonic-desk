import { describe, expect, it, vi } from "vitest";
import {
  createSettings,
  DEFAULT_SETTINGS,
  parseSettings,
  SETTINGS_KEY,
} from "../../src/lib/settings.js";

describe("settings", () => {
  it("parses stored settings field by field with defaults for anything off", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("not json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("[]")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"cardRows":{"alone":2,"combined":0}}').cardRows).toEqual({
      alone: 2,
      combined: 1,
    });
    expect(parseSettings('{"cardRows":{"alone":21,"combined":"3"}}').cardRows).toEqual({
      alone: 3,
      combined: 1,
    });
  });
  it("reads storage once, writes on set, and survives storage that throws", () => {
    const store = new Map<string, string>([[SETTINGS_KEY, '{"cardRows":{"alone":5}}']]);
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const s = createSettings(storage);
    expect(s.current.value.cardRows).toEqual({ alone: 5, combined: 1 });
    s.set({ cardRows: { alone: 2, combined: 2 } });
    expect(store.get(SETTINGS_KEY)).toBe('{"cardRows":{"alone":2,"combined":2}}');
    const broken = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("full");
      }),
    };
    const b = createSettings(broken);
    expect(b.current.value).toEqual(DEFAULT_SETTINGS);
    b.set({ cardRows: { alone: 1, combined: 1 } });
    expect(b.current.value.cardRows.alone).toBe(1);
    expect(createSettings(null).current.value).toEqual(DEFAULT_SETTINGS);
  });
});
