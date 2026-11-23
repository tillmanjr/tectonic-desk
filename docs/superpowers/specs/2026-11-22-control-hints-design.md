# Control hints

Every optional setting on the map header (layer toggles, the fault picker, Field, Section, zoom,
Reset, Animate, the lock) and on both refine bars (inputs, selects, Reset, Hide markers, the info
mark) explains itself in a hint written for a reader with geology training.

## Decisions

- One directive, `v-hint` (`apps/web/src/lib/hint.ts`), not the native `title`: the browser's
  tooltip delay cannot be set. `HINT_DELAY_MS` is 1000.
- The directive only writes `data-hint`. One set of document listeners (installed while any hinted
  element is mounted) finds the innermost `[data-hint]` under the pointer, so a label and the input
  inside it can each carry text, and a label's hint covers its widget.
- One floating `role=tooltip` box on `body`, clamped to the viewport; the owner gets
  `aria-describedby` while it shows. A pointer hint goes under the arrow where the pointer came to
  rest (20 px below the hot spot, so the cursor never covers it), or above the pointer near the
  bottom; a focus hint goes under the control. A shown hint does not follow the pointer.
- Keyboard focus shows the hint after the same delay; a press, Escape, scroll or leaving hides it,
  and the focus a click brings does not re-show it.
- Hinted controls drop their `title` so two tooltips never stack.
