import type {
  ApiEvent,
  ApiEventDetail,
  ApiEventFilter,
  ApiMechanism,
  ApiRun,
  ApiVolcanoReport,
  ApiVolcanoStatus,
  EventWithMechanisms,
  StoredEvent,
  StoredMechanism,
} from "@tectonic/shared";
import type { IngestRunRow, VolcanoReportRow, VolcanoStatusRow } from "../db/schema.js";
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
