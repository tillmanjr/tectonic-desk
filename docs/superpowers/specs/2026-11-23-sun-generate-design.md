# Generated Sun animations

When the agencies' latest movies (48 hours for SDO, about 4 days for LASCO) do not cover the Space
page's window, the Sun overlay offers "Generate animation for this window": a Helioviewer.org movie
of that channel over the window.

## Research (2026-11-23)

- Helioviewer's v2 API queues a movie (`queueMovie`, one layer, any span) and reports it
  (`getMovieStatus`: 0 queued, 1 processing with a fractional `progress`, 2 done with `url`,
  3 failed). It spreads up to 300 frames over the span. A day of AIA 193 at 512 px took about
  10 s; seven days of AIA 304 about 53 s. Its archive starts 2010-06-02 (AIA), 2010-12-06 (HMI)
  and 1997-02-21 (LASCO).

## Decisions

- Server: `src/space/helioviewer.ts` (`createHelioviewerClient`: the layer and image scale per
  channel, halved at 1024 px) and `src/space/sun-movies.ts` (`createSunMovieCache`, injected as
  `buildApp({ sunMovies })`): one build per channel, size and span rounded out to whole hours,
  shared by every reader; status polled at most every 2 s; ready movies kept 6 hours, failures
  1 minute; 200 builds remembered. `GET /api/space/sun/:key/movie?from=&to=&size=` answers the
  build state (`ApiSunMovie`), uncached while building and cached an hour when ready; 400 for a
  span over 30 days (`SUN_MOVIE_MAX_MS`) or before the archive (`SUN_ARCHIVE_START`), 502 when
  the build failed.
- Web: `src/lib/sun-generate.ts` (`movieSpan`: the window rounded to hours, cut to its last 30
  days, started at the archive; `coveredByLatest`; `useGeneratedMovie` polls every 3 s).
  `SunOverlay` shows the button with an info mark (the hint explains the feature) only where the
  latest movie falls short, asks first in a Cancel/Continue dialog naming the span and saying it
  "may take from a few seconds to several minutes" (plus a note when the window was cut or began
  before the archive), shows "Building the animation… n%" with Stop waiting, then plays it under
  a Generated mode beside Animation and Still, captioned with its span and Helioviewer's credit.
  It generates at the size selected (512 px by default). Stepping to another channel drops it.
- The Caddyfile's `media-src` adds `https://api.helioviewer.org`, where the movies are served.
