import { describe, expect, it } from "vitest";
import {
  createPins,
  fmtLatLon,
  parsePin,
  parsePins,
  PIN_HISTORY,
  PIN_NAME_MAX,
  PINS_KEY,
  pinTitle,
  type Pin,
} from "../../src/lib/pins.js";

const pin = (over: Partial<Pin> = {}): Pin => ({
  id: "p1",
  view: "global",
  lon: -122.5,
  lat: 37.75,
  name: "",
  placed: "2026-11-22T10:00:00.000Z",
  ...over,
});

function memory(initial: string | null = null): Storage & { saved: string | null } {
  const s = {
    saved: initial,
    getItem: () => s.saved,
    setItem: (_k: string, v: string) => {
      s.saved = v;
    },
  };
  return s as unknown as Storage & { saved: string | null };
}

describe("parsePin", () => {
  it("keeps a well-formed pin and clips a long name", () => {
    expect(parsePin(pin())).toEqual(pin());
    expect(parsePin(pin({ name: "x".repeat(PIN_NAME_MAX + 5) }))?.name).toHaveLength(PIN_NAME_MAX);
  });

  it("drops anything malformed", () => {
    for (const bad of [
      null,
      "pin",
      { ...pin(), id: "" },
      { ...pin(), id: 3 },
      { ...pin(), view: "mars" },
      { ...pin(), lon: 181 },
      { ...pin(), lat: Number.NaN },
      { ...pin(), lat: "37" },
      { ...pin(), name: 4 },
      { ...pin(), placed: 4 },
      { ...pin(), placed: "not a date" },
    ]) {
      expect(parsePin(bad)).toBeNull();
    }
  });
});

describe("parsePins", () => {
  it("starts empty on nothing, bad JSON or a non-object", () => {
    const empty = { current: { global: null, wc: null }, history: [] };
    expect(parsePins(null)).toEqual(empty);
    expect(parsePins("{")).toEqual(empty);
    expect(parsePins("[]")).toEqual({ ...empty, history: [] });
    expect(parsePins('{"current":3,"history":{}}')).toEqual(empty);
  });

  it("keeps good pins under their own view, drops the rest and caps the history", () => {
    const wc = pin({ id: "w", view: "wc" });
    const history = Array.from({ length: PIN_HISTORY + 3 }, (_, i) => pin({ id: `h${String(i)}` }));
    const doc = parsePins(
      JSON.stringify({ current: { global: wc, wc }, history: [{ bad: true }, ...history] }),
    );
    expect(doc.current).toEqual({ global: null, wc });
    expect(doc.history).toHaveLength(PIN_HISTORY);
    expect(doc.history[0]?.id).toBe("h0");
  });
});

describe("formatting", () => {
  it("writes latitude then longitude to four places with true minus signs", () => {
    expect(fmtLatLon(-122.41942, 37.77493)).toBe("37.7749, −122.4194");
    expect(fmtLatLon(10, -5)).toBe("−5.0000, 10.0000");
  });

  it("titles a pin by name when it has one", () => {
    expect(pinTitle(pin())).toBe("37.7500, −122.5000");
    expect(pinTitle(pin({ name: "Hayward" }))).toBe("Hayward · 37.7500, −122.5000");
  });
});

describe("createPins", () => {
  const at = new Date("2026-11-22T12:00:00Z");

  it("places one pin per view, records each placement and persists", () => {
    const storage = memory();
    const pins = createPins(storage, () => at);
    const a = pins.place("global", [10, 20]);
    expect(a).toMatchObject({
      view: "global",
      lon: 10,
      lat: 20,
      name: "",
      placed: at.toISOString(),
    });
    const b = pins.place("global", [11, 21]);
    pins.place("wc", [-120, 40]);
    expect(b.id).not.toBe(a.id);
    expect(pins.doc.value.current.global).toEqual(b);
    expect(pins.doc.value.current.wc?.lon).toBe(-120);
    expect(pins.doc.value.history.map((h) => h.lon)).toEqual([-120, 11, 10]);
    expect(storage.saved).toBe(JSON.stringify(pins.doc.value));
    expect(createPins(storage).doc.value).toEqual(pins.doc.value);
  });

  it("moves and renames the view's pin and its history entry, and removes it but keeps the entry", () => {
    const pins = createPins(memory(), () => at);
    pins.move("global", [1, 1]);
    pins.rename("global", "nothing");
    pins.remove("global");
    expect(pins.doc.value.history).toEqual([]);
    const older = pins.place("global", [0, 0]);
    pins.place("wc", [-120, 40]);
    pins.place("global", [5, 5]);
    pins.move("global", [6, 7]);
    pins.rename("global", `  ${"n".repeat(PIN_NAME_MAX + 2)}  `);
    const cur = pins.doc.value.current.global;
    expect(cur).toMatchObject({ lon: 6, lat: 7, name: "n".repeat(PIN_NAME_MAX) });
    expect(pins.doc.value.history[0]).toEqual(cur);
    expect(pins.doc.value.history[2]).toEqual(older);
    pins.remove("global");
    expect(pins.doc.value.current.global).toBeNull();
    expect(pins.doc.value.history).toHaveLength(3);
  });

  it("caps the history at the newest placements", () => {
    const pins = createPins(null, () => at);
    for (let i = 0; i < PIN_HISTORY + 2; i++) pins.place("global", [i, 0]);
    expect(pins.doc.value.history).toHaveLength(PIN_HISTORY);
    expect(pins.doc.value.history[0]?.lon).toBe(PIN_HISTORY + 1);
  });

  it("survives storage that throws, and defaults to the real clock", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    const pins = createPins(broken);
    const p = pins.place("wc", [-121, 38]);
    expect(Date.parse(p.placed)).not.toBeNaN();
    expect(pins.doc.value.current.wc).toEqual(p);
  });

  it("reads localStorage by default", () => {
    localStorage.setItem(PINS_KEY, JSON.stringify({ current: { global: pin() }, history: [] }));
    expect(createPins().doc.value.current.global).toEqual(pin());
    localStorage.removeItem(PINS_KEY);
  });
});
