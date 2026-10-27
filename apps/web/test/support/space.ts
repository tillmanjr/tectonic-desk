import type {
  ApiSpaceAlert,
  ApiSpaceFlare,
  ApiSpaceNow,
  ApiSpaceReading,
  ApiSpaceScales,
  ApiSpaceWindow,
} from "@tectonic/shared";

/** The web tests' "now": the same instant `makeContext` uses. */
export const SPACE_NOW = "2026-10-13T12:00:00.000Z";
const NOW_MS = Date.parse(SPACE_NOW);
const H = 3_600_000;

export const reading = (value: number, source = "swpc", time = SPACE_NOW): ApiSpaceReading => ({
  time,
  value,
  source,
});

/** Points every `stepMs` ending at now, oldest first. */
export function pointsEnding(stepMs: number, values: number[]): [number, number][] {
  return values.map((v, i) => [NOW_MS - (values.length - 1 - i) * stepMs, v]);
}

export const flare = (over: Partial<ApiSpaceFlare> = {}): ApiSpaceFlare => ({
  beginTime: "2026-10-13T10:30:00.000Z",
  maxTime: "2026-10-13T10:52:00.000Z",
  endTime: "2026-10-13T11:10:00.000Z",
  beginClass: "C2.1",
  maxClass: "M1.3",
  endClass: "C5.0",
  maxXrlong: 1.3e-5,
  satellite: 18,
  ...over,
});

export const alert = (over: Partial<ApiSpaceAlert> = {}): ApiSpaceAlert => ({
  productId: "K05W",
  issueTime: "2026-10-13T11:02:00.000Z",
  message:
    "Space Weather Message Code: WARK05\r\nSerial Number: 5444\r\nIssue Time: 2026 Oct 13 1102 UTC\r\n\r\nWARNING: Geomagnetic K-index of 5 expected\nValid From: 2026 Oct 13 1100 UTC\nValid To: 2026 Oct 13 2100 UTC",
  ...over,
});

export const scalesRow = (over: Partial<ApiSpaceScales> = {}): ApiSpaceScales => ({
  day: "2026-10-13T00:00:00.000Z",
  kind: "observed",
  issued: "2026-10-13T11:45:00.000Z",
  r: 0,
  s: 0,
  g: 1,
  rMinorProb: null,
  rMajorProb: null,
  sProb: null,
  kpMax: 5,
  ...over,
});

/** Yesterday and today observed, then three predicted days. */
export const SCALES: ApiSpaceScales[] = [
  scalesRow({ day: "2026-10-12T00:00:00.000Z", g: 0, kpMax: 3.33 }),
  scalesRow(),
  scalesRow({
    kind: "predicted",
    r: null,
    s: null,
    g: 2,
    rMinorProb: 35,
    rMajorProb: 5,
    sProb: 5,
    kpMax: 5.67,
  }),
  scalesRow({
    day: "2026-10-14T00:00:00.000Z",
    kind: "predicted",
    r: null,
    s: null,
    g: 0,
    rMinorProb: 25,
    rMajorProb: 1,
    sProb: 1,
    kpMax: 3.33,
  }),
  scalesRow({
    day: "2026-10-15T00:00:00.000Z",
    kind: "predicted",
    r: null,
    s: null,
    g: 0,
    rMinorProb: 20,
    rMajorProb: 1,
    sProb: 1,
    kpMax: null,
  }),
];

export function spaceNow(over: Partial<ApiSpaceNow> = {}): ApiSpaceNow {
  return {
    generatedAt: SPACE_NOW,
    latest: {
      kp_1m: reading(3.67),
      kp_3h: reading(4, "swpc", "2026-10-13T09:00:00.000Z"),
      dst: reading(-35, "kyoto", "2026-10-13T11:00:00.000Z"),
      bz_gsm: reading(-6.2, "SOLAR1"),
      bt: reading(9.8, "SOLAR1"),
      speed: reading(612, "SOLAR1"),
      density: reading(7.1, "SOLAR1"),
      xray_long: reading(4.2e-6, "GOES-18"),
      xray_short: reading(2e-7, "GOES-18"),
      p10: reading(0.4, "GOES-18"),
      p100: reading(0.1, "GOES-18"),
      hp_north: reading(19.5, "ovation"),
      hp_south: reading(18.1, "ovation"),
      kp_gfz: reading(4.33, "gfz-pre", "2026-10-13T09:00:00.000Z"),
      ap: reading(18, "gfz", "2026-10-12T00:00:00.000Z"),
      ssn: reading(120, "gfz", "2026-10-12T00:00:00.000Z"),
      f107: reading(165.2, "gfz", "2026-10-12T00:00:00.000Z"),
    },
    scales: SCALES,
    latestFlare: flare(),
    latestAlert: alert(),
    ...over,
  };
}

/** A 24-hour window ending at now with a few points per series, one flare and two alerts. */
export function spaceWindow(over: Partial<ApiSpaceWindow> = {}): ApiSpaceWindow {
  return {
    from: new Date(NOW_MS - 24 * H).toISOString(),
    to: SPACE_NOW,
    bucketSeconds: null,
    samples: {
      kp_1m: pointsEnding(60_000, [3, 3.33, 3.33, 3.67, 3.67]),
      kp_3h: pointsEnding(3 * H, [2, 2.33, 3, 3.67, 4.33, 5, 4.67, 4]),
      dst: pointsEnding(H, [-5, -8, -12, -20, -31, -40, -38, -35]),
      bz_gsm: pointsEnding(60_000, [2.1, -1.4, -4.8, -6.0, -6.2]),
      bt: pointsEnding(60_000, [6.1, 7.3, 8.8, 9.5, 9.8]),
      speed: pointsEnding(60_000, [540, 571, 598, 605, 612]),
      density: pointsEnding(60_000, [4.1, 5.0, 6.2, 6.9, 7.1]),
      xray_long: pointsEnding(60_000, [1.1e-6, 2.5e-6, 1.3e-5, 6e-6, 4.2e-6]),
      xray_short: pointsEnding(60_000, [8e-8, 1.2e-7, 9e-7, 3e-7, 2e-7]),
      p10: pointsEnding(300_000, [0.3, 0.3, 0.4, 0.4]),
      p100: pointsEnding(300_000, [0.1, 0.1, 0.1, 0.1]),
      hp_north: pointsEnding(300_000, [12, 14, 19, 21, 19.5]),
      hp_south: pointsEnding(300_000, [11, 13, 17, 19, 18.1]),
      kp_gfz: pointsEnding(3 * H, [2, 2.33, 3.33, 3.67, 4.33, 5.33, 4.67, 4.33]),
      ap: [],
      ssn: [],
      f107: [],
    },
    preliminaryKpFrom: null,
    flares: [flare()],
    alerts: [alert(), alert({ productId: "K04A", issueTime: "2026-10-13T08:31:00.000Z" })],
    scales: SCALES.slice(0, 2),
    ...over,
  };
}
