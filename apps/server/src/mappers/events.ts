import type { Event, StoredEvent } from "@tectonic/shared";
import type { EventInsert, EventRow } from "../db/schema.js";

export function rowToEvent(row: EventRow): StoredEvent {
  return {
    id: row.id,
    time: row.time,
    updated: row.updated,
    latitude: row.latitude,
    longitude: row.longitude,
    depthKm: row.depthKm,
    mag: row.mag,
    magType: row.magType,
    place: row.place,
    net: row.net,
    status: row.status,
    alert: row.alert,
    sig: row.sig,
    felt: row.felt,
    cdi: row.cdi,
    mmi: row.mmi,
    tsunami: row.tsunami,
    raw: row.raw,
    firstSeen: row.firstSeen,
    lastSeen: row.lastSeen,
  };
}

export function eventToRow(e: Event): EventInsert {
  return {
    id: e.id,
    time: e.time,
    updated: e.updated,
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
    raw: e.raw,
  };
}
