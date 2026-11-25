# Field manual: a home for the deep dives

Date: 2026-11-24. Status: built (branch `field-manual`).

## Why

There are 33 deep dives in eight areas. The Help menu's dropdown suits the six quick tours but not a reference of that size. Deep dives
should feel unlike quick tours: quick tours are a guided walk played from the "?" menu, deep dives are something you look up. Five
mockups were compared (index drawer, field manual page, annotated desk, in-place marks, search); the reader chose the field manual
page as the home and in-place marks as the way in from each part of the desk.

## Decisions

- **The Field manual is its own page**, `/manual`, with `#<chapter>` for a chapter (`#intro`, `#refine`, `#map`, …). It sits at the
  right end of the page navigation, set apart from the four data pages by a rule. The route goes before the old `/:region` redirect.
  No region; the region the reader came from is kept for the deep dives it starts.
- **Chapters.** 1 Introduction to Tectonic Desk: what the desk is for, how the four pages relate, and the six quick tours with
  their seen state and Take/Resume. Then one chapter per deep-dive area in catalogue order (Refine, Map, Earthquake detail, Charts,
  Volcano detail, Marks, Space, Settings), each opening with the quick tour that introduces it. A chapter list on the left (stacked
  above on a phone) with taken counts. The page is built from a chapter list so a later Glossary chapter is an addition, not a
  rewrite; the glossary itself is out of this build.
- **Cards.** One per deep dive: title, blurb, the controls it covers, step count, and Take it / Resume (step n of m) / Again.
- **The "?" menu** keeps the quick tours and Reset; its Deep dives section is replaced by "Open the Field manual". The tour card's
  note on a detour says the deep dive is in the Field manual rather than the Help menu.
- **Ending a deep dive started from the manual**: the view is restored as now, then a small prompt offers "Back to the Field
  manual" (default, Enter) or "Stay here" (Esc). Back returns to the same chapter, scrolled to that card. Started anywhere else
  (a ◆ mark, a quick-tour detour), it ends where it began, as today.
- **◆ marks.** A small orange diamond on the header of each part of the desk that has deep dives: the refine bars, the map
  toolbar, the event and volcano panels, the charts, the Marks rail, and on Space the tiles, stack, aurora and Sun strip. It opens
  a popover listing that part's deep dives with their state, and a link to the chapter. The mark fades once every deep dive in its
  part is taken. On by default; Settings gets "Deep dive marks" on/off beside hints (`settings.ts`, kept in `tectonic.settings`).
- **Progress** is the existing tour progress (`tectonic.tour`): no new store. The "?" colour pop still counts quick tours only.

## Out of scope

The glossary (later chapter), search (mockup E), and the annotated-desk view (mockup C).

## As built

- `ManualPage.vue` shows one chapter at a time; the chapter list counts what is taken. Card ids are `card-<tour id>`; the
  card the hash names is highlighted and its button focused, so Enter takes it again.
- The runner's `start(id, step, { view, returnTo })` opens the reader's last view first (kept by `App.vue` as `lastView`), and
  its `returning` holds the manual's place once the tour ends; `TourReturn.vue` is the prompt.
- The ◆ is split in two (`DiveMark.vue` decides whether to show, `DiveMarkMenu.vue` is the list) so the list never meets a
  missing runner. The list opens rightwards for a mark in the left half of the window.
- The deep dives' closing steps now point at the Field manual (`data-tour="manual"`), and the Settings deep dive gains a
  step on the marks.
- Revised the same day at the reader's request, to read more like a bound manual: the manual sits on its own lifted sheet,
  ruled under its title, with a gutter and a rule between the contents and the page. The introduction is split in two,
  1 Introduction (prose, ending in a link onward) and 2 Introductory tours (the quick tours as cards), and the deep-dive
  chapters follow from 3. Every page is the same height for a given width: all chapters are laid in one grid cell, the one
  on view visible and the rest `visibility: hidden` and `inert`, so the page takes the height of the longest.
