import { describe, expect, it, vi } from "vitest";
import {
  aviationColor,
  createVolcanoStore,
  distanceKm,
  EMPTY_VOLCANO_FILTER,
  eruptionClass,
  eruptionStart,
  inBBox,
  isElevated,
  isVolcanoFilterActive,
  lastEruptionText,
  parseVolcanoFilter,
  settingGroup,
  statusLabel,
  statusRank,
  typeGroup,
  volcanoFilterQuery,
} from "../../src/lib/volcanoes.js";
import { fakeApi } from "../support/api.js";
import { WC } from "../support/events.js";
import { eruption, status, volcano } from "../support/volcanoes.js";

const now = () => new Date("2026-10-13T12:00:00Z");

describe("classification", () => {
  it("bins last eruption years, volcano types and tectonic settings", () => {
    expect(eruptionClass(null)).toBe("unknown");
    expect(eruptionClass(2026)).toBe("recent");
    expect(eruptionClass(1950)).toBe("recent");
    expect(eruptionClass(1949)).toBe("historic");
    expect(eruptionClass(1500)).toBe("historic");
    expect(eruptionClass(-6190)).toBe("holocene");
    expect(typeGroup("Stratovolcano(es)")).toBe("stratovolcano");
    expect(typeGroup("Shield(s)")).toBe("shield");
    expect(typeGroup("Caldera(s)")).toBe("caldera");
    expect(typeGroup("Submarine")).toBe("submarine");
    expect(typeGroup("Pyroclastic cone(s)")).toBe("cone");
    expect(typeGroup("Maar(s)")).toBe("cone");
    expect(typeGroup("Lava dome(s)")).toBe("dome");
    expect(typeGroup("Complex")).toBe("complex");
    expect(typeGroup("Fissure vent(s)")).toBe("fissure");
    expect(typeGroup("Volcanic field")).toBe("other");
    expect(settingGroup(null)).toBe("unknown");
    expect(settingGroup("Subduction zone / Continental crust (>25 km)")).toBe("subduction");
    expect(settingGroup("Rift zone / Oceanic crust (< 15 km)")).toBe("rift");
    expect(settingGroup("Intraplate / Oceanic crust (< 15 km)")).toBe("intraplate");
    expect(settingGroup("Unknown")).toBe("unknown");
  });
  it("ranks and labels agency statuses without merging their scales", () => {
    expect(statusRank(status())).toBe(3);
    expect(statusRank(status({ level: "WARNING" }))).toBe(4);
    expect(statusRank(status({ level: "ADVISORY" }))).toBe(2);
    expect(statusRank(status({ level: "NORMAL" }))).toBe(0);
    expect(statusRank(status({ level: "UNASSIGNED" }))).toBe(0);
    expect(statusRank(status({ source: "geonet", level: "2" }))).toBe(2);
    expect(statusRank(status({ source: "geonet", level: "x" }))).toBe(0);
    expect(isElevated(status({ level: "NORMAL" }))).toBe(false);
    expect(statusLabel(status())).toBe("USGS Watch · Orange");
    expect(statusLabel(status({ source: "geonet", level: "2", color: "YELLOW" }))).toBe(
      "GeoNet level 2 · Yellow",
    );
    expect(statusLabel(status({ color: null }))).toBe("USGS Watch");
    expect(aviationColor("YELLOW")).toBe("var(--av-yellow)");
    expect(aviationColor("ORANGE")).toBe("var(--av-orange)");
    expect(aviationColor("RED")).toBe("var(--av-red)");
    expect(aviationColor("GREEN")).toBe("var(--muted)");
    expect(aviationColor(null)).toBe("var(--muted)");
  });
  it("parses and writes the filter query", () => {
    expect(parseVolcanoFilter({})).toEqual(EMPTY_VOLCANO_FILTER);
    expect(
      parseVolcanoFilter({ setting: "rift", type: "shield", age: "recent", status: "elevated" }),
    ).toEqual({ setting: "rift", type: "shield", age: "recent", status: "elevated" });
    expect(parseVolcanoFilter({ setting: "moon", type: 3 })).toEqual(EMPTY_VOLCANO_FILTER);
    expect(volcanoFilterQuery({ ...EMPTY_VOLCANO_FILTER, age: "unknown" })).toEqual({
      setting: undefined,
      type: undefined,
      age: "unknown",
      status: undefined,
    });
    expect(isVolcanoFilterActive(EMPTY_VOLCANO_FILTER)).toBe(false);
    expect(isVolcanoFilterActive({ ...EMPTY_VOLCANO_FILTER, status: "monitored" })).toBe(true);
  });
  it("tests bboxes, measures distances and formats eruption dates", () => {
    expect(inBBox(volcano({ lat: 46.2, lon: -122.18 }), WC.bbox)).toBe(true);
    expect(inBBox(volcano({ lat: 19.4, lon: -155.3 }), WC.bbox)).toBe(false);
    expect(inBBox(volcano(), null)).toBe(true);
    expect(Math.round(distanceKm(37.7749, -122.4194, 34.0522, -118.2437))).toBe(559);
    expect(eruptionStart(eruption())).toBe("2022-11-27");
    expect(eruptionStart(eruption({ startDay: null }))).toBe("2022-11");
    expect(eruptionStart(eruption({ startMonth: null, startDay: null }))).toBe("2022");
    expect(
      eruptionStart(
        eruption({
          startYear: -6190,
          startMonth: 3,
          startDay: 1,
          startModifier: "~",
          startYearUncertainty: 200,
        }),
      ),
    ).toBe("~6191 BCE ± 200");
    expect(lastEruptionText(volcano())).toBe("last erupted 2026");
    expect(lastEruptionText(volcano({ lastEruptionYear: null }))).toBe("last eruption unknown");
    expect(lastEruptionText(volcano({ lastEruptionYear: -1000 }))).toBe("last erupted 1001 BCE");
  });
});

describe("createVolcanoStore", () => {
  it("loads the files once, joins live state, and derives the view, summary and attention list", async () => {
    const api = fakeApi();
    const store = createVolcanoStore(api, now);
    await Promise.all([store.load(), store.load()]);
    await store.load();
    expect(vi.mocked(api.geo).mock.calls.filter((c) => c[0] === "volcanoes")).toHaveLength(1);
    expect(api.volcanoStatus).toHaveBeenCalledTimes(3);
    expect(store.volcanoes.value).toHaveLength(5);
    expect(store.pulledAt.value).toBe("2026-10-17T00:00:00.000Z");
    expect(store.liveAt.value).toEqual(now());
    expect(store.inRegion.value).toHaveLength(5);
    expect(store.filtered.value).toHaveLength(5);
    expect([...store.continuing.value]).toEqual([211060]);
    expect(store.eruptionsOf.value.get(211060)?.map((e) => e.startYear)).toEqual([
      2022, 2013, 1669, -6190,
    ]);
    expect(store.rankOf(332010)).toBe(3);
    expect(store.rankOf(241040)).toBe(2);
    expect(store.rankOf(321050)).toBe(0);
    expect(store.rankOf(1)).toBe(0);
    expect(store.summary.value).toEqual({
      elevatedUs: 1,
      highestUs: "Watch",
      geonetActive: 1,
      continuingInView: 1,
      changes7d: 1,
      newThisWeek: 1,
    });
    expect(store.attention.value.map((a) => [a.status.key, a.volcano?.name ?? null])).toEqual([
      ["332010", "Kilauea"],
      ["whiteisland", "Whakaari/White Island"],
    ]);
    store.setRegion(WC);
    expect(store.inRegion.value.map((v) => v.name)).toEqual(["St. Helens", "Clear Lake"]);
    expect(store.summary.value.continuingInView).toBe(0);
    store.setRegion(null);
    store.setFilter({ ...EMPTY_VOLCANO_FILTER, age: "recent" });
    expect(store.filtered.value).toHaveLength(4);
    store.setFilter({ ...EMPTY_VOLCANO_FILTER, age: "unknown" });
    expect(store.filtered.value.map((v) => v.name)).toEqual(["Clear Lake"]);
    store.setFilter({ ...EMPTY_VOLCANO_FILTER, type: "shield" });
    expect(store.filtered.value.map((v) => v.name)).toEqual(["Kilauea"]);
    store.setFilter({ ...EMPTY_VOLCANO_FILTER, setting: "intraplate" });
    expect(store.filtered.value.map((v) => v.name)).toEqual(["Kilauea"]);
    store.setFilter({ ...EMPTY_VOLCANO_FILTER, status: "elevated" });
    expect(store.filtered.value.map((v) => v.number)).toEqual([332010, 241040]);
    store.setFilter({ ...EMPTY_VOLCANO_FILTER, status: "continuing" });
    expect(store.filtered.value.map((v) => v.number)).toEqual([211060]);
    store.setFilter({ ...EMPTY_VOLCANO_FILTER, status: "monitored" });
    expect(store.filtered.value.map((v) => v.number)).toEqual([321050, 332010, 241040]);
    store.select(332010);
    expect(store.selected.value?.name).toBe("Kilauea");
    store.select(999);
    expect(store.selected.value).toBeNull();
    store.select(null);
    expect(store.selectedNumber.value).toBeNull();
    vi.mocked(api.volcanoStatus).mockResolvedValueOnce({
      generatedAt: "x",
      statuses: [status(), status({ id: 10, level: "ADVISORY", color: "YELLOW" })],
    });
    await store.refreshLive();
    expect(store.statusesOf.value.get(332010)).toHaveLength(2);
    expect(store.rankOf(332010)).toBe(3);
  });
  it("reports empty summaries and keeps files when the live fetch fails", async () => {
    const api = fakeApi({
      volcanoStatus: vi.fn().mockResolvedValue({ generatedAt: "x", statuses: [] }),
      volcanoChanges: vi.fn().mockResolvedValue({ days: 7, changes: [] }),
      volcanoReports: vi.fn().mockResolvedValue({ weeks: 4, reports: [] }),
    });
    const store = createVolcanoStore(api, now);
    await store.load();
    expect(store.summary.value).toMatchObject({
      elevatedUs: 0,
      highestUs: null,
      geonetActive: 0,
      newThisWeek: null,
    });
    expect(store.attention.value).toEqual([]);
    vi.mocked(api.volcanoStatus).mockRejectedValueOnce(new Error("status down"));
    await store.refreshLive();
    expect(store.error.value).toBe("status down");
    expect(store.volcanoes.value).toHaveLength(5);
    await store.refreshLive();
    expect(store.error.value).toBeNull();
  });
  it("records a failed file load and retries it on the next load", async () => {
    const api = fakeApi();
    vi.mocked(api.geo).mockRejectedValueOnce(new Error("no files"));
    const store = createVolcanoStore(api, now);
    await store.load();
    expect(store.error.value).toBe("no files");
    expect(store.loading.value).toBe(false);
    await store.load();
    expect(store.volcanoes.value).toHaveLength(5);
  });
  it("dedupes attention entries, keeping the newest observation per source and key", async () => {
    const older = status({
      id: 9,
      level: "ADVISORY",
      color: "YELLOW",
      observedAt: "2026-09-01T00:00:00.000Z",
    });
    const taupo = status({
      id: 11,
      source: "geonet",
      key: "taupo",
      number: 241070,
      name: "Taupo",
      level: "1",
      color: "GREEN",
      observedAt: "2026-10-12T20:00:00.000Z",
    });
    const api = fakeApi({
      volcanoChanges: vi.fn().mockResolvedValue({ days: 7, changes: [older, status(), taupo] }),
    });
    const geo = vi.mocked(api.geo).getMockImplementation();
    vi.mocked(api.geo).mockImplementation((name) =>
      name === "eruptions"
        ? Promise.resolve({
            meta: { source: "fixture", pulledAt: "x", count: 2 },
            items: [eruption(), eruption({ number: 22495, startYear: 2022, continuing: false })],
          })
        : (geo?.(name) ?? Promise.resolve(null)),
    );
    const store = createVolcanoStore(api, now);
    await store.load();
    const kilauea = store.attention.value.find((a) => a.status.key === "332010");
    expect(kilauea?.status.level).toBe("WATCH");
    const unlisted = store.attention.value.find((a) => a.status.key === "taupo");
    expect(unlisted?.volcano).toBeNull();
    expect(store.eruptionsOf.value.get(211060)?.map((e) => e.number)).toEqual([22495, 22494]);
  });
});
