# Quick tour

The app has grown past the point where a first look explains it. A manual would live apart from the
app and drift out of date, so the tour runs inside the app itself, points at the real controls, and
is checked by the tests like any other code.

## Decisions

- **The tour drives the app.** Steps switch pages, select an earthquake, draw an example section
  and measurement, open the pin bar and turn a field on, so each step shows what it describes. When
  the tour ends, finished or not, the reader's view comes back: the route (page, region, selection,
  section, filters) is replaced with the one in force when the tour started, and every map
  setting a step touched is set back, the zoom included (the detail step's selection and the
  section step zoom the map). Map settings on a page the tour left are not kept by the
  app anyway (a page's map starts fresh), so only the map still on screen is restored.
- **First visit offer.** On a first plain visit (no query: not a shared link to an event, a mark or
  a section) one line slides into the notice position: "New here? Take the tour" with a ×. Any
  other action dismisses it for good: a press anywhere else, a key (Tab and modifier keys aside, so
  the button can be reached), a wheel or touch scroll, a route change. Taking the tour dismisses it
  as well.
- **Help menu.** A "?" button beside Settings opens the Help menu, which holds the tour hub for now
  and has room for shortcuts, sources or "What's new" later. Each tour lists its state (not
  started, step n of m, done), Start or Resume and Restart, and its steps, any of which starts the
  tour there. The menu's first line offers to resume the tour left unfinished most recently.
- **Unseen steps stand out.** The "?" is filled in the accent colour until every step of every
  tour has been shown at least once, then returns to the grey of the other header pills. Steps are
  tracked by id, so a step or tour added later brings the colour back until the reader has seen
  it.
- **First release.** The engine, the Help menu, the offer, an orientation tour (the app's parts,
  on Active Earth) and the Map tools tour. Earthquakes, Volcanoes, Marks and Space follow as content.
- **Own code, no library.** It is about the size of a library's adapter, fits the hint system and
  the touch rules, and stays under the coverage thresholds.

## Mechanics

- **Targets.** A step names one or more `data-tour` values; the spotlight is the union of every
  element carrying them, so a step can light a toolbar button and the map together. A step whose
  targets are absent (still loading, or not on this page) shows its card with a note instead of
  a spotlight. Targets are looked up again every 200 ms while a tour runs, so the spotlight follows
  layout shifts as data lands, and the first time a step finds its target it is scrolled into
  view (centred, unless already visible).
- **Spotlight.** A rounded cut-out drawn by a box-shadow over the rest of the window. It never takes
  pointer events, so the app stays usable under it: "Try it" steps ask the reader to use the
  highlighted tool, and nothing stops them doing anything else.
- **Card.** Docked at the bottom of the window when the target is in the upper half, else at the
  top, full width on a phone and 440 px wide otherwise, so it never sits on the control it
  describes (on an iPad, fingers and the card do not fight). It reads "Map tools · 4 of 12", the
  step title and text, an optional "Try it" line, a row of step dots (each a button), Back, Next
  (Done on the last step) and Exit. Escape exits unless something else consumed it (a map tool in
  use, theater mode), and ← and → step when focus is not in a field.
- **Progress** lives in `localStorage` (`tectonic.tour`): per tour the step reached, whether it was
  finished, and when; the ids of the steps shown; the tour last left; and whether the offer was
  dismissed. A bad or missing
  entry reads as a fresh start.
- **Staging.** `App.vue` builds the stage a step acts through (`TourStage`: go to a page, select
  the largest event in the window, write a section, the map on screen) and snapshots the route at
  the start. `MapShell` attaches its `MapView` while mounted; the first time a tour reaches for it,
  the map's toggles, field, measurement, pin bar, theater state and zoom are recorded for the
  restore (`MapView.setTransform` puts the zoom back).

## Keeping it in sync

Steps live in one file (`src/lib/tour-steps.ts`) and reach controls only through `data-tour`
attributes. A test mounts the whole app, walks every step of every tour through the real stage,
and fails when a target matches nothing, so removing or renaming a control without updating the
tour breaks the build rather than the tour.

## Files

- `src/lib/tour.ts`: `createTourProgress(storage)` (persistence, `parseTourProgress`), `createTour`
  (the runner: `start`, `next`, `back`, `goTo`, `exit`, `finish`, map attach and restore),
  `TOUR_PROGRESS` and `TOUR` keys.
- `src/lib/tour-steps.ts`: `TOURS` (orientation, map) and the example section and measurement.
- `src/lib/tour-target.ts`: `targetRect` (union of the targets' boxes), `dockOf`, `isVisible`.
- `TourCard.vue` (spotlight and card), `HelpMenu.vue` (the "?" menu), `TourOffer.vue` (the first
  visit line).
