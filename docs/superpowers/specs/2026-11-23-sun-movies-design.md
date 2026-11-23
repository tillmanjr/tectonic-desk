# Sun animations

The Sun overlay on the Space page plays the channel's animation instead of only the latest still.

## Research (2026-11-23)

- SDO publishes `latest_{512,1024}_<channel>.mp4` for every AIA and HMI channel the strip shows,
  covering the last 48 hours (512 px: 2.5 to 9 MB; 1024 px: 13 to 48 MB).
- SOHO publishes `current_c2.mp4` and `current_c3.mp4` (1024 px; C3 about 75 MB) and
  `current_c2small.mp4`, `current_c3small.mp4` (512 px; 1 and 10 MB), covering about four days.
- Helioviewer can build a movie for any window (about 10 s for a day at 512 px), but the reader
  preferred the look of SDO's own 1024 px renders.

## Decisions

- `src/lib/sun-movies.ts` (`SUN_MOVIES`, `movieNote`): the agencies' latest movies, played from
  their servers; `deploy/Caddyfile` allows `media-src` from `sdo.gsfc.nasa.gov` and
  `soho.nascom.nasa.gov`. No proxy: the files are large and the agencies serve range requests.
- `SunOverlay.vue` opens on the animation (muted, looping, inline, with controls, the latest still
  as its poster) at 512 px; "Higher resolution" switches to 1024 px. The Animation/Still and size
  choices hold while stepping between channels. "Loading animation…" until the first frame;
  a movie that fails falls back to the still and says so.
- The movies cover a fixed recent span, which no window preset matches, so the caption always says
  so: "Showing the last 48 hours only; the page shows 7 days."
