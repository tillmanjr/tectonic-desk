# Glossary

Date: 2026-11-25. Status: built (branch `glossary`).

## Why

The desk shows terms from three fields (seismology, volcanology, space weather) and names its own tools (window,
floor, section, marks). A reader trained in geology knows most of the first, less of the space weather, and none of
the desk's own words. The Field manual was built so a Glossary chapter could be added later; this is that chapter,
plus a way to reach an entry from the label on the desk.

## Decisions

- **Scope**: science terms the desk shows and the desk's own vocabulary, about 85 entries, written for a peer.
  Space weather gets the most help.
- **Entry**: a one-line definition (the same text the hover hint shows), a short paragraph on what it measures,
  its units and how the desk uses it, a small scale table where one exists (Kp and the G scale, Dst, GOES class and
  the R scale, MMI, alert levels), "See also" links, the deep dive that shows it, and the source agency.
- **Chapter**: the last chapter of the Field manual, `#glossary`, one entry each at `#glossary/<term id>`. A–Z with
  a letter strip, a filter box and area chips (Earthquakes, Volcanoes, Space, Maps and fields, The desk). The
  chapter is not laid in the shared grid cell with the others, so its length does not set every page's height.
- **On the desk**: key labels (the mechanism and impact rows, the catalogue rows, the volcano panel, the Space tiles
  and stack rows, the chart titles' terms) carry `v-term="id"`. Hover or focus shows the one-line definition after
  the usual hint delay, with how to open the entry.
- **Settings**: "Glossary underlines" On/Off (default On) draws a faint dotted underline under linked terms;
  "Open glossary on" Double click / Click / Off (default Double click) picks the trigger, to avoid accidental
  navigation. Enter on a focused term opens it unless Off. On touch, with Double click a tap shows the hint and a
  second tap while it shows opens the entry; with Click a tap opens it and a hold shows the hint.
- Mockup approved first (https://claude.ai/artifact/495tWTkhvvi6kvMCdk2CFk).

## As built

- `src/lib/glossary.ts`: `GLOSSARY` (keyed by term id, so `TermId` is checked in templates), areas, filtering,
  letters, `GLOSSARY_CHAPTER`, the trigger modes and `TERM_OPEN_EVENT`.
- `src/lib/term.ts`: `vTerm` (an object directive). It reads the trigger from the nearest `[data-glossary-open]`
  when used, refreshes its hint text on hover and focus, and dispatches a bubbling `glossary-open` event. The
  panels are siblings of the page in `App.vue`'s template, so the shell puts the `gunder` class and
  `data-glossary-open` on the document's root and listens there, turning the event into
  `manual.show("glossary", id)`. It shares the hint machinery through `attachHint`/`detachHint`/`setHint`/
  `hintShownFor`/`dropHint` in `hint.ts`.
- `GlossaryChapter.vue` in `ManualPage.vue`, outside the shared stack; `parseManualHash` accepts a term id as the
  glossary's card. The filter strip is not sticky (the top bar's height varies with the width); letter headings
  carry a scroll margin that clears it.
- Linked so far: the event panel (epicentre, depth, event id, review status, every impact row), the mechanism
  block (heading, class, planes, axes, moment, Mw, centroid depth, double couple), the volcano panel (type,
  setting, last eruption, GVP number, status, weekly report), the Space tiles and the stack's row names.
- The Settings deep dive gains a Glossary step; the manual's introduction mentions the chapter.
