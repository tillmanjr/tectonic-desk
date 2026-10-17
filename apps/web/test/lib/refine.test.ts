import { describe, expect, it } from "vitest";
import { EMPTY_FILTER } from "../../src/lib/filters.js";
import { quakeParts, volcanoParts } from "../../src/lib/refine.js";
import {
  EMPTY_VOLCANO_FILTER,
  ERUPTION_CLASSES,
  SETTING_GROUPS,
  STATUS_FILTERS,
  TYPE_GROUPS,
} from "../../src/lib/volcanoes.js";

const span = { since: "2026-07-19", until: "2026-10-17" };

describe("refine summaries", () => {
  it("describes the earthquake filter, marking what is set", () => {
    expect(quakeParts(EMPTY_FILTER, span, 4.5, "90 days")).toEqual([
      { text: "M4.5+", set: false },
      { text: "90 days from 2026-07-19 to 2026-10-17", set: false },
      { text: "depth any", set: false },
    ]);
    expect(
      quakeParts(
        { ...EMPTY_FILTER, minMag: 5, maxMag: 6, minDepth: 10, maxDepth: 200, since: "2026-07-19" },
        span,
        5,
        null,
      ),
    ).toEqual([
      { text: "M5 to M6", set: true },
      { text: "custom from 2026-07-19 to 2026-10-17", set: true },
      { text: "depth 10–200 km", set: true },
    ]);
    expect(quakeParts({ ...EMPTY_FILTER, minDepth: 10 }, span, 4.5, "90 days")[2]).toEqual({
      text: "depth from 10 km",
      set: true,
    });
    expect(quakeParts({ ...EMPTY_FILTER, maxDepth: 70 }, span, 4.5, "90 days")[2]).toEqual({
      text: "depth to 70 km",
      set: true,
    });
  });
  it("describes the volcano filter with the group labels", () => {
    expect(volcanoParts(EMPTY_VOLCANO_FILTER)).toEqual([
      { text: "setting any", set: false },
      { text: "type any", set: false },
      { text: "last eruption any", set: false },
      { text: "status any", set: false },
    ]);
    expect(
      volcanoParts({
        setting: "subduction",
        type: "stratovolcano",
        age: "recent",
        status: "elevated",
      }),
    ).toEqual([
      { text: `setting ${SETTING_GROUPS.subduction.toLowerCase()}`, set: true },
      { text: `type ${TYPE_GROUPS.stratovolcano.toLowerCase()}`, set: true },
      { text: `last eruption ${ERUPTION_CLASSES.recent.label.toLowerCase()}`, set: true },
      { text: `status ${STATUS_FILTERS.elevated.toLowerCase()}`, set: true },
    ]);
  });
});
