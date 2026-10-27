# Space Weather: Sun Images

**Date:** 2026-10-26. **Status:** approved in outline (decisions below), spec under review.
Space weather sub-project 4 of 4 (see `2026-10-25-space-weather-design.md`).

## Goal

The latest picture of the Sun on the Space page: seven frames from SDO and SOHO as a strip under
the tiles, each opening large in an overlay with what it shows, its time and its credit.

## Decisions (2026-10-26)

| Topic     | Decision                                                                                                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pictures  | SDO AIA 193, 304 and 171, HMI intensitygram and magnetogram; SOHO LASCO C2 and C3. SUVI left out.                                                                                      |
| Replay    | Latest frames only. A 24-hour replay from SWPC's frame lists is a later candidate.                                                                                                     |
| Placement | Option A of the mockups: a strip of seven thumbnails between the tiles and the alert cards, always shown whatever the window.                                                          |
| Overlay   | Version 2 of the mockups: the 1024 px frame with its caption and a filmstrip of the seven inside the box; Escape, × or a click outside closes; ← → and the filmstrip change the frame. |
| Proxy     | Frames go through the server (fixed in the space weather spec): an in-memory cache, no database rows, the frame's upstream `Last-Modified` as its time.                                |

## Sources (verified 2026-10-26)

**SDO** (`https://sdo.gsfc.nasa.gov/assets/img/latest/latest_<size>_<channel>.jpg`, sizes 512 and
1024; `Cache-Control: no-cache`, `Last-Modified` set, refreshed every 10 to 15 minutes). 512 px
frames are about 45 to 100 KB, 1024 px 140 to 400 KB. Not copyrighted; the requested credit is
"Courtesy of NASA/SDO and the AIA, EVE, and HMI science teams" (`sdo.gsfc.nasa.gov/data/rules.php`).

**SOHO LASCO** (`https://soho.nascom.nasa.gov/data/realtime/<c2|c3>/<512|1024>/latest.jpg`,
`Last-Modified` set, every 12 minutes). 512 px about 90 to 150 KB, 1024 px 450 to 820 KB. Credit
"SOHO (ESA & NASA)".

## The catalogue

`packages/shared/src/sun.ts`:

```ts
export const SUN_FRAMES = [
  {
    key: "aia193",
    title: "AIA 193 Å",
    note: "Corona at 1.2 MK; coronal holes dark, active regions bright",
    source: "sdo",
  },
  {
    key: "aia304",
    title: "AIA 304 Å",
    note: "Chromosphere and transition region, 50 000 K; prominences and filaments",
    source: "sdo",
  },
  {
    key: "aia171",
    title: "AIA 171 Å",
    note: "Quiet corona and coronal loops, 0.6 MK",
    source: "sdo",
  },
  { key: "hmii", title: "HMI intensitygram", note: "Visible light; sunspots", source: "sdo" },
  {
    key: "hmib",
    title: "HMI magnetogram",
    note: "Line-of-sight field; white toward us, black away",
    source: "sdo",
  },
  {
    key: "c2",
    title: "LASCO C2",
    note: "Corona from 1.5 to 6 solar radii, the disk occulted; CMEs leave here",
    source: "soho",
  },
  { key: "c3", title: "LASCO C3", note: "Corona from 3.7 to 30 solar radii", source: "soho" },
] as const;
export type SunKey = (typeof SUN_FRAMES)[number]["key"];
export type SunSize = 512 | 1024;
export const SUN_CREDIT: Record<"sdo" | "soho", string>;
export interface SunFrameMeta {
  key: SunKey;
  time: Date | null;
  bytes: number;
}
```

API types in `api.ts`: `ApiSunFrames { generatedAt: string; frames: Json<SunFrameMeta>[] }`.

## Server

- `src/space/sun.ts`: `sunUrl(key, size)` builds the upstream URL (SDO channel codes `0193`,
  `0304`, `0171`, `HMIIC`, `HMIB`; SOHO `c2`, `c3`). `createSunCache({ fetch?, userAgent,
ttlMs = 300_000, timeoutMs = 30_000, now })` with `get(key, size): Promise<SunImage>` where
  `SunImage { bytes: Buffer; contentType: string; lastModified: Date | null; fetchedAt: Date }`.
  A hit younger than `ttlMs` is served from memory; otherwise one upstream fetch per (key, size)
  at a time (a second caller awaits the same promise); on an upstream failure a stale copy is
  served and the failure logged, else the error propagates. `metas(): Promise<SunFrameMeta[]>`
  refreshes the seven 512 px frames and returns their times and sizes.
- `buildApp({ sun })` takes the cache (tests inject one over a stub fetch); `index.ts` creates it
  with the USGS user agent.
- Routes in `routes/sun.ts`: `GET /api/space/sun` answers `ApiSunFrames`, cached 60 s.
  `GET /api/space/sun/:key/:size.jpg` streams the bytes with the upstream content type,
  `Last-Modified`, `Cache-Control: public, max-age=3600` (the web busts it by time), and its own
  rate limit of 600 a minute like the aurora frames. Unknown key or size is a 404; an upstream
  failure without a stale copy is a 502 `{ error: "sun frame unavailable" }`.
- Memory: fourteen frames at most, about 3 MB.

## Web

- `lib/api.ts`: `sunFrames()` and `sunImageUrl(key, size, time)` (the time as a query string so
  a new upstream frame gets a new URL and the hour-long cache stays honest).
- The space store gains `sun: ShallowRef<ApiSunFrames | null>`, read in `load()` beside the two
  other calls through its own catch, so a failing image service leaves the page's error line
  alone and the strip shows its note.
- `SunStrip.vue` under the tiles, above `SpaceAlerts`: section label "The Sun · SDO and SOHO";
  seven `<button class="sunthumb">` with the 512 px image, title and `HH:MM UTC` (or local) from
  the frame's time; "No frames yet." while null. Four columns on phones.
- `SunOverlay.vue`: `role="dialog"`, `aria-modal`, opened with a key, focus on the ×; the 1024 px
  frame sized to `min(90vw, 70vh)` square, caption `title · note` then `time · credit`, the
  filmstrip of seven 512 px thumbnails with the open one outlined (`.on`), ← → step, Escape and
  a click on the backdrop close, the page's scroll locked while open.
- Credits: footer paragraph and README rows for SDO and SOHO.

## Testing

Server: `sunUrl` for every key and size; the cache (fresh hit, expiry, in-flight sharing, stale
on failure with a warn, error without stale, metas); routes (manifest shape and cache header,
image bytes and headers, 404s, 502, rate-limit config). Web: api URL builder, store sun load and
its isolated failure, strip rendering and click, overlay keys, filmstrip, close paths, focus.
100 % on all three packages.

## Out of scope

Replays, SUVI, Enlil, image history, a region-of-interest zoom inside the overlay.
