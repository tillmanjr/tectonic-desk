import type {
  ApiAuroraFrame,
  ApiAuroraFrameMeta,
  ApiEvent,
  ApiEventDetail,
  ApiEventFilter,
  ApiMechanism,
  ApiRun,
  ApiSpaceAlert,
  ApiSpaceFlare,
  ApiSpaceReading,
  ApiSpaceScales,
  ApiVolcanoReport,
  ApiVolcanoStatus,
  AuroraFrame,
  AuroraFrameMeta,
  EventWithMechanisms,
  StoredEvent,
  StoredMechanism,
} from "@tectonic/shared";
import type {
  IngestRunRow,
  SpaceAlertRow,
  SpaceFlareRow,
  SpaceSampleRow,
  SpaceScalesRow,
  VolcanoReportRow,
  VolcanoStatusRow,
} from "../db/schema.js";
import type { EventsFilter } from "./schemas.js";

export const iso = (d: Date): string => d.toISOString();
export const isoOrNull = (d: Date | null): string | null => (d === null ? null : d.toISOString());

export function toApiFilter(q: EventsFilter): ApiEventFilter {
  return { since: iso(q.since), until: isoOrNull(q.until), minMag: q.minMag, bbox: q.bbox };
}

export function toApiMechanism(m: StoredMechanism): ApiMechanism {
  return {
    id: m.id,
    eventId: m.eventId,
    kind: m.kind,
    source: m.source,
    code: m.code,
    preferred: m.preferred,
    strike1: m.strike1,
    dip1: m.dip1,
    rake1: m.rake1,
    strike2: m.strike2,
    dip2: m.dip2,
    rake2: m.rake2,
    tAzimuth: m.tAzimuth,
    tPlunge: m.tPlunge,
    pAzimuth: m.pAzimuth,
    pPlunge: m.pPlunge,
    nAzimuth: m.nAzimuth,
    nPlunge: m.nPlunge,
    mrr: m.mrr,
    mtt: m.mtt,
    mpp: m.mpp,
    mrt: m.mrt,
    mrp: m.mrp,
    mtp: m.mtp,
    scalarMoment: m.scalarMoment,
    mw: m.mw,
    depthKm: m.depthKm,
    percentDc: m.percentDc,
    planesReconstructed: m.planesReconstructed,
    productUpdated: isoOrNull(m.productUpdated),
  };
}

export function toApiEvent(e: StoredEvent, mechanisms: StoredMechanism[]): ApiEvent {
  return {
    id: e.id,
    time: iso(e.time),
    updated: iso(e.updated),
    latitude: e.latitude,
    longitude: e.longitude,
    depthKm: e.depthKm,
    mag: e.mag,
    magType: e.magType,
    place: e.place,
    net: e.net,
    status: e.status,
    alert: e.alert,
    sig: e.sig,
    felt: e.felt,
    cdi: e.cdi,
    mmi: e.mmi,
    tsunami: e.tsunami,
    eventType: e.eventType,
    types: e.types,
    mechanisms: mechanisms.map(toApiMechanism),
  };
}

export function toApiEventDetail(e: EventWithMechanisms): ApiEventDetail {
  return {
    ...toApiEvent(e, e.mechanisms),
    firstSeen: iso(e.firstSeen),
    lastSeen: iso(e.lastSeen),
    detailCheckedUpdated: isoOrNull(e.detailCheckedUpdated),
    usgs: e.raw,
  };
}

export function toApiVolcanoStatus(r: VolcanoStatusRow): ApiVolcanoStatus {
  return {
    id: r.id,
    source: r.source,
    key: r.key,
    number: r.number,
    name: r.name,
    level: r.level,
    color: r.color,
    noticeAt: isoOrNull(r.noticeAt),
    synopsis: r.synopsis,
    url: r.url,
    observedAt: iso(r.observedAt),
  };
}

export function toApiVolcanoReport(r: VolcanoReportRow): ApiVolcanoReport {
  return {
    id: r.id,
    number: r.number,
    name: r.name,
    week: iso(r.week),
    category: r.category,
    title: r.title,
    body: r.body,
    url: r.url,
    fetchedAt: iso(r.fetchedAt),
  };
}

export function toApiRun(r: IngestRunRow): ApiRun {
  return {
    id: r.id,
    kind: r.kind,
    startedAt: iso(r.startedAt),
    finishedAt: isoOrNull(r.finishedAt),
    ok: r.ok,
    eventsInserted: r.eventsInserted,
    eventsUpdated: r.eventsUpdated,
    eventsSkipped: r.eventsSkipped,
    detailsFetched: r.detailsFetched,
    mechanismsUpserted: r.mechanismsUpserted,
    error: r.error,
    detail: r.detail,
  };
}

export function toApiSpaceReading(r: SpaceSampleRow): ApiSpaceReading {
  return { time: iso(r.time), value: r.value, source: r.source };
}

export function toApiSpaceFlare(r: SpaceFlareRow): ApiSpaceFlare {
  return {
    beginTime: iso(r.beginTime),
    maxTime: isoOrNull(r.maxTime),
    endTime: isoOrNull(r.endTime),
    beginClass: r.beginClass,
    maxClass: r.maxClass,
    endClass: r.endClass,
    maxXrlong: r.maxXrlong,
    satellite: r.satellite,
  };
}

export function toApiSpaceAlert(r: SpaceAlertRow): ApiSpaceAlert {
  return { productId: r.productId, issueTime: iso(r.issueTime), message: r.message };
}

export function toApiSpaceScales(r: SpaceScalesRow): ApiSpaceScales {
  return {
    day: iso(r.day),
    kind: r.kind,
    issued: iso(r.issued),
    r: r.r,
    s: r.s,
    g: r.g,
    rMinorProb: r.rMinorProb,
    rMajorProb: r.rMajorProb,
    sProb: r.sProb,
    kpMax: r.kpMax,
  };
}

export function toApiAuroraFrameMeta(f: AuroraFrameMeta): ApiAuroraFrameMeta {
  return {
    observed: iso(f.observed),
    forecast: iso(f.forecast),
    powerNorth: f.powerNorth,
    powerSouth: f.powerSouth,
  };
}

/** The grid travels as base64: 65 160 bytes become about 87 KB of text. */
export function toApiAuroraFrame(f: AuroraFrame): ApiAuroraFrame {
  return { ...toApiAuroraFrameMeta(f), grid: Buffer.from(f.grid).toString("base64") };
}
