import { describe, expect, it } from "vitest";
import {
  AREA_NAMES,
  filterGlossary,
  GLOSSARY,
  GLOSSARY_AREAS,
  GLOSSARY_LIST,
  howToOpen,
  isTermId,
  letterOf,
  termById,
} from "../../src/lib/glossary.js";
import { TOURS } from "../../src/lib/tour-catalog.js";

describe("the glossary", () => {
  it("links only to entries and deep dives that exist, and keeps each hint to a line or two", () => {
    for (const e of GLOSSARY_LIST) {
      for (const id of e.see ?? []) expect(isTermId(id), `${e.id} → ${id}`).toBe(true);
      if (e.dive !== undefined) {
        expect(TOURS.find((t) => t.id === e.dive)?.deep, `${e.id} → ${e.dive}`).toBeDefined();
      }
      expect(e.short.length, e.id).toBeLessThanOrEqual(170);
      expect(e.long, e.id).not.toBe("");
      expect(e.see ?? [], e.id).not.toContain(e.id);
    }
    expect(GLOSSARY_LIST.length).toBe(Object.keys(GLOSSARY).length);
    expect(GLOSSARY_LIST.length).toBeGreaterThan(80);
  });

  it("lists A to Z by term, and files each under its first letter", () => {
    const terms = GLOSSARY_LIST.map((e) => e.term.toLowerCase());
    expect(terms).toEqual([...terms].sort((a, b) => a.localeCompare(b)));
    expect(letterOf({ term: "b-value" })).toBe("B");
  });

  it("finds an entry by id, and none for an id it does not hold", () => {
    expect(termById("kp")).toMatchObject({ id: "kp", term: "Kp", area: "space" });
    expect(termById("nope")).toBeNull();
    expect(isTermId("toString")).toBe(false);
  });

  it("filters by term or line, any case, within an area", () => {
    expect(filterGlossary("", null)).toHaveLength(GLOSSARY_LIST.length);
    expect(filterGlossary("  KP ", null).map((e) => e.id)).toContain("kp");
    // the line matches too: Ap's mentions Kp
    expect(filterGlossary("kp", null).map((e) => e.id)).toContain("ap");
    expect(filterGlossary("kp", "earthquakes")).toEqual([]);
    expect(filterGlossary("", "volcanoes").every((e) => e.area === "volcanoes")).toBe(true);
    expect(GLOSSARY_AREAS).toEqual(["earthquakes", "volcanoes", "space", "maps", "desk"]);
    expect(AREA_NAMES.maps).toBe("Maps and fields");
  });

  it("says how a linked term opens its entry", () => {
    expect(howToOpen("dblclick")).toBe("Double-click for the glossary");
    expect(howToOpen("click")).toBe("Click for the glossary");
    expect(howToOpen("off")).toBe("");
  });
});
