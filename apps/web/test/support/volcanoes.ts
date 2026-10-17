import type {
  ApiVolcanoChanges,
  ApiVolcanoDetail,
  ApiVolcanoReport,
  ApiVolcanoReportList,
  ApiVolcanoStatus,
  ApiVolcanoStatusList,
  Eruption,
  GeoFile,
  Volcano,
} from "@tectonic/shared";

export function volcano(over: Partial<Volcano> = {}): Volcano {
  return {
    number: 211060,
    name: "Etna",
    country: "Italy",
    region: "European Volcanic Regions",
    subregion: "Sicily Volcanic Province",
    lat: 37.748,
    lon: 14.999,
    elevationM: 3357,
    type: "Stratovolcano(es)",
    landform: "Composite",
    rockType: "Trachybasalt / Tephrite Basanite",
    tectonicSetting: "Subduction zone / Continental crust (>25 km)",
    lastEruptionYear: 2026,
    evidence: "Eruption Observed",
    summary:
      "Mount Etna, on the island of Sicily, has one of the world's longest documented records of volcanism.",
    ...over,
  };
}

export function eruption(over: Partial<Eruption> = {}): Eruption {
  return {
    number: 22494,
    volcano: 211060,
    activity: "Confirmed Eruption",
    vei: 2,
    veiModifier: null,
    startYear: 2022,
    startMonth: 11,
    startDay: 27,
    startYearUncertainty: null,
    startModifier: null,
    endYear: null,
    endMonth: null,
    endDay: null,
    continuing: true,
    ...over,
  };
}

export const VOLCANOES: Volcano[] = [
  volcano(),
  volcano({
    number: 321050,
    name: "St. Helens",
    country: "United States",
    region: "Canada and Western USA",
    subregion: "Washington",
    lat: 46.2,
    lon: -122.18,
    elevationM: 2549,
    lastEruptionYear: 2008,
  }),
  volcano({
    number: 332010,
    name: "Kilauea",
    country: "United States",
    region: "Hawaii and Pacific Ocean",
    subregion: "Hawaii",
    lat: 19.421,
    lon: -155.287,
    elevationM: 1222,
    type: "Shield(s)",
    tectonicSetting: "Intraplate / Oceanic crust (< 15 km)",
    lastEruptionYear: 2024,
  }),
  volcano({
    number: 241040,
    name: "Whakaari/White Island",
    country: "New Zealand",
    region: "New Zealand to Fiji",
    subregion: "New Zealand",
    lat: -37.52,
    lon: 177.18,
    elevationM: 294,
    lastEruptionYear: 2019,
  }),
  volcano({
    number: 323010,
    name: "Clear Lake",
    country: "United States",
    region: "Canada and Western USA",
    subregion: "California",
    lat: 38.97,
    lon: -122.77,
    elevationM: 1439,
    type: "Volcanic field",
    tectonicSetting: null,
    lastEruptionYear: null,
    summary: null,
  }),
];

export const ERUPTIONS: Eruption[] = [
  eruption(),
  eruption({
    number: 20841,
    startYear: 2013,
    startMonth: 9,
    startDay: 3,
    vei: 3,
    endYear: 2022,
    continuing: false,
  }),
  eruption({
    number: 13000,
    startYear: 1669,
    startMonth: 3,
    startDay: 11,
    vei: 3,
    veiModifier: "?",
    endYear: 1669,
    continuing: false,
  }),
  eruption({
    number: 13484,
    startYear: -6190,
    startMonth: null,
    startDay: null,
    startYearUncertainty: 200,
    startModifier: "~",
    vei: null,
    continuing: false,
  }),
  eruption({
    number: 18000,
    volcano: 321050,
    startYear: 2004,
    startMonth: 10,
    startDay: 1,
    vei: 2,
    endYear: 2008,
    continuing: false,
  }),
  eruption({
    number: 17999,
    volcano: 321050,
    startYear: 1980,
    startMonth: 3,
    startDay: 27,
    vei: 5,
    endYear: 1986,
    continuing: false,
  }),
  eruption({
    number: 23000,
    volcano: 332010,
    startYear: 2024,
    startMonth: 12,
    startDay: 23,
    vei: 0,
    continuing: false,
  }),
  eruption({
    number: 21000,
    volcano: 241040,
    startYear: 2019,
    startMonth: 12,
    startDay: 9,
    vei: 2,
    endYear: 2019,
    continuing: false,
  }),
];

export const volcanoFile: GeoFile<Volcano> = {
  meta: { source: "GVP fixture", pulledAt: "2026-10-17T00:00:00.000Z", count: VOLCANOES.length },
  items: VOLCANOES,
};
export const eruptionFile: GeoFile<Eruption> = {
  meta: { source: "GVP fixture", pulledAt: "2026-10-17T00:00:00.000Z", count: ERUPTIONS.length },
  items: ERUPTIONS,
};

export function status(over: Partial<ApiVolcanoStatus> = {}): ApiVolcanoStatus {
  return {
    id: 1,
    source: "usgs",
    key: "332010",
    number: 332010,
    name: "Kilauea",
    level: "WATCH",
    color: "ORANGE",
    noticeAt: "2026-10-12T19:54:02.000Z",
    synopsis: null,
    url: "https://volcanoes.usgs.gov/hans-public/notice/x",
    observedAt: "2026-10-12T20:00:00.000Z",
    ...over,
  };
}

export const STATUSES: ApiVolcanoStatus[] = [
  status(),
  status({
    id: 2,
    key: "321050",
    number: 321050,
    name: "Mount St. Helens",
    level: "NORMAL",
    color: "GREEN",
    noticeAt: "2026-10-01T20:01:03.000Z",
    observedAt: "2026-10-01T20:05:00.000Z",
  }),
  status({
    id: 3,
    key: "avo",
    number: null,
    name: "Alaskan Volcanoes",
    level: "NORMAL",
    color: "GREEN",
    noticeAt: null,
    url: null,
    observedAt: "2026-10-01T20:05:00.000Z",
  }),
  status({
    id: 4,
    source: "geonet",
    key: "whiteisland",
    number: 241040,
    name: "White Island",
    level: "2",
    color: "YELLOW",
    noticeAt: null,
    synopsis: "Moderate to heightened volcanic unrest.",
    url: "https://www.geonet.org.nz/volcano/whiteisland",
    observedAt: "2026-10-05T00:00:00.000Z",
  }),
  status({
    id: 5,
    source: "geonet",
    key: "taupo",
    number: 241070,
    name: "Taupo",
    level: "0",
    color: "GREEN",
    noticeAt: null,
    synopsis: "No volcanic unrest.",
    url: "https://www.geonet.org.nz/volcano/taupo",
    observedAt: "2026-10-05T00:00:00.000Z",
  }),
];

export const REPORTS: ApiVolcanoReport[] = [
  {
    id: 1,
    number: 211060,
    name: "Etna",
    week: "2026-10-14T00:00:00.000Z",
    category: "new",
    title: "Etna (Italy) - New Activity/Unrest",
    body: "<p>Strombolian activity resumed at the SE Crater.</p>",
    url: "https://volcano.si.edu/volcano.cfm?vn=211060",
    fetchedAt: "2026-10-15T00:00:00.000Z",
  },
  {
    id: 2,
    number: 321050,
    name: "St. Helens",
    week: "2026-10-07T00:00:00.000Z",
    category: "ongoing",
    title: "St. Helens (United States) - Ongoing Activity",
    body: "Minor seismicity continued.",
    url: "https://volcano.si.edu/volcano.cfm?vn=321050",
    fetchedAt: "2026-10-08T00:00:00.000Z",
  },
];

export const statusList: ApiVolcanoStatusList = {
  generatedAt: "2026-10-13T12:00:00.000Z",
  statuses: STATUSES,
};
export const changeList: ApiVolcanoChanges = { days: 7, changes: [status()] };
export const reportList: ApiVolcanoReportList = { weeks: 4, reports: REPORTS };
export const kilaueaDetail: ApiVolcanoDetail = {
  number: 332010,
  statuses: [
    status(),
    status({ id: 0, level: "ADVISORY", color: "YELLOW", observedAt: "2026-09-01T00:00:00.000Z" }),
  ],
  reports: [],
};
