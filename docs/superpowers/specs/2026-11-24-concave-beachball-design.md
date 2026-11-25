# Concave beachball

## Purpose

The lower-hemisphere beachball is the view down into the lower half of the focal sphere: a bowl.
Drawn flat, it reads to most eyes as a dome seen from outside, and the reader has to correct for
that in the head. An option draws the event panel's beachball as the inside of the sphere so it
reads as concave at a glance. It is an option beside today's plot, not a replacement.

## Decisions

- Mockup first (four renderings: flat, gentle bowl shading, bowl with rim shadow, tilted bowl),
  then the reader's idea: show the tilted bowl at 30°, ease it to 0° in a couple of seconds, and
  keep a slider for ad hoc use. The slider runs from −60° (seen from the north) to +60° (from the
  south).
- The bowl is a height field over the equal-area disc, not a true sphere: a disc point at radius r
  sits at depth 0.9 · cos i(r). Straight down it is the equal-area plot pixel for pixel, so the
  settle ends on the true projection. Tilted, it is not equal-area and the wall under the near rim
  is hidden; a T or P behind the rim is drawn as a dashed ring.
- Shading is lightness only, lit from the north-west at 42°: diffuse light on the inward normal of
  the true ray, the rim's cast shadow, and less sky towards the rim. Compressional quadrants keep
  their depth colour, so grey never stands in for "shaded".
- Side panel only (`MechanismBlock`, so also the marks overlay's panels). Map beachballs, cards
  and mark thumbnails stay flat.
- Settings menu row "Beachball: Flat / Bowl", default Flat, stored as `beachball` in
  `tectonic.settings`. The menu now stays in the page while closed (`v-show`) so a tour can flip
  the switch by name and give it back at the end.
- Timing: hold 700 ms at 30°, ease in and out over 2.2 s. ↻ replays it; moving the slider stops
  it; a new solution settles afresh, a refreshed copy of the same one does not. Reduced motion
  opens at 0°.
- Tours: the Focal mechanism deep dive gains "Seen from inside" (turns Bowl on for the step), the
  Settings deep dive gains "Beachball", and the Earthquakes quick tour's mechanism step mentions
  the option.

## Code

`src/lib/bowl.ts` (geometry, shading, sampling, rasterising, `settleTilt`), `bowlScene` and
`drawBowl` in `src/lib/beachball.ts`, `BowlBeachball.vue` (canvas, slider, replay).
