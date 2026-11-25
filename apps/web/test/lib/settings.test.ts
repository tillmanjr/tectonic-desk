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
    expect(parseSettings('{"diveMarks":false}').diveMarks).toBe(false);
    expect(parseSettings('{"diveMarks":"no"}').diveMarks).toBe(true);
    expect(parseSettings('{"beachball":"bowl"}').beachball).toBe("bowl");
    expect(parseSettings('{"beachball":"dome"}').beachball).toBe("flat");
    expect(parseSettings('{"glossaryUnderlines":false}').glossaryUnderlines).toBe(false);
    expect(parseSettings('{"glossaryUnderlines":0}').glossaryUnderlines).toBe(true);
    expect(parseSettings('{"glossaryOpen":"click"}').glossaryOpen).toBe("click");
    expect(parseSettings('{"glossaryOpen":"hover"}').glossaryOpen).toBe("dblclick");
    expect(parseSettings('{"autoZoom":false}').autoZoom).toBe(false);
    expect(parseSettings('{"autoZoom":"off"}').autoZoom).toBe(true);
    expect(parseSettings('{"theaterDetails":false}').theaterDetails).toBe(false);
    expect(parseSettings('{"theaterDetails":1}').theaterDetails).toBe(true);
  });
  it("reads storage once, writes on set, and survives storage that throws", () => {
    const store = new Map<string, string>([[SETTINGS_KEY, '{"cardRows":{"alone":5}}']]);
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const s = createSettings(storage);
    expect(s.current.value.cardRows).toEqual({ alone: 5, combined: 1 });
    s.set({
      cardRows: { alone: 2, combined: 2 },
      diveMarks: false,
      beachball: "bowl",
      glossaryUnderlines: false,
      glossaryOpen: "off",
      autoZoom: false,
      theaterDetails: false,
    });
    expect(store.get(SETTINGS_KEY)).toBe(
      '{"cardRows":{"alone":2,"combined":2},"diveMarks":false,"beachball":"bowl","glossaryUnderlines":false,"glossaryOpen":"off","autoZoom":false,"theaterDetails":false}',
    );
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
    b.set({ ...DEFAULT_SETTINGS, cardRows: { alone: 1, combined: 1 } });
    expect(b.current.value.cardRows.alone).toBe(1);
    expect(createSettings(null).current.value).toEqual(DEFAULT_SETTINGS);
  });
});
