import { describe, expect, it } from "vitest";
import { hereTarget, showsKind } from "../../src/lib/marks-nav.js";
import type { Mark } from "../../src/lib/marks.js";

const quake: Mark = {
  id: "a",
  kind: "event",
  ref: "us1",
  name: "Kuril shock",
  url: "/earthquakes/wc?event=us1",
  frame: "wc",
  lon: -122,
  lat: 37,
  headline: "M5.5 mww",
  sub: "10 km N of Somewhere",
  stamp: "2026-10-13T10:00:00.000Z",
  mag: 5.5,
  depthKm: 10,
  createdAt: "2026-10-21T00:00:00.000Z",
};
const etna: Mark = { ...quake, id: "b", kind: "volcano", ref: "211060", stamp: null };

describe("marks-nav", () => {
  it("knows which pages can show each kind", () => {
    expect(showsKind("earthquakes", "event")).toBe(true);
    expect(showsKind("earthquakes", "volcano")).toBe(false);
    expect(showsKind("volcanoes", "event")).toBe(false);
    expect(showsKind("volcanoes", "volcano")).toBe(true);
    expect(showsKind("active", "event")).toBe(true);
    expect(showsKind("active", "volcano")).toBe(true);
    expect(showsKind("space", "event")).toBe(false);
    expect(showsKind("space", "volcano")).toBe(false);
  });

  it("selects the mark in the current view, dropping the other selection", () => {
    expect(hereTarget("earthquakes", "wc", { from: "2026-01-01", volcano: "1" }, quake)).toEqual({
      url: "/earthquakes/wc?from=2026-01-01&event=us1",
      switched: false,
    });
    expect(hereTarget("volcanoes", "global", { event: "us9", tz: "local" }, etna)).toEqual({
      url: "/volcanoes?tz=local&volcano=211060",
      switched: false,
    });
    expect(hereTarget("active", "global", {}, quake)).toEqual({
      url: "/active?event=us1",
      switched: false,
    });
  });

  it("switches to Active Earth with the same region when the page cannot show the kind", () => {
    expect(hereTarget("volcanoes", "wc", { from: "2026-01-01" }, quake)).toEqual({
      url: "/active/wc?from=2026-01-01&event=us1",
      switched: true,
    });
    expect(hereTarget("earthquakes", "global", {}, etna)).toEqual({
      url: "/active?volcano=211060",
      switched: true,
    });
  });
});
