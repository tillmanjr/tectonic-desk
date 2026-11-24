import type { StepContext, Tour } from "../tour.js";
import { showExample, showMarks } from "../tour-steps.js";

/**
 * Deep dives of marks, over the Marks tour's three examples (Petrolia, Ridgecrest, Kīlauea) in a
 * Tour examples group the runner takes out again at the end.
 */

const list = (all: boolean) => (ctx: StepContext) => showMarks(ctx, "list", all);

export const MARKS_GROUPS: Tour = {
  id: "marks-groups",
  title: "Marking and groups",
  blurb: "Marking an event or volcano, the groups rail, chips, ordering, and opening a mark again.",
  deep: { area: "Marks" },
  pageFor: () => "earthquakes",
  steps: [
    {
      id: "intro",
      title: "Marks",
      body: "Marks keep events and volcanoes with the view you found them in, in this browser. For these steps three examples are added in a group called Tour examples, and taken out again at the end; anything you mark yourself stays.",
      targets: [],
      enter: showExample,
    },
    {
      id: "mark",
      title: "Marking",
      body: "☆ Mark, under the name in every event and volcano panel, asks for a name, the headline and place to start with; Enter saves, Esc cancels. It saves the view with the mark: page, region, window and selection. Once marked the star fills, and resting on it says how many times; the same event can be marked again from another view.",
      tryIt: "Mark this event.",
      targets: ["detail.mark"],
      enter: showExample,
    },
    {
      id: "rail",
      title: "The groups rail",
      body: "All your marks first, then each group with its count, in the order you set. + New group asks for a name; Enter adds it.",
      targets: ["marks.rail"],
      enter: list(true),
    },
    {
      id: "chips",
      title: "Chips",
      body: "Every group appears as a chip on every mark: press one to put the mark in that group or take it out. A mark can be in any number of groups, or none.",
      targets: ["marks.row"],
      enter: list(true),
    },
    {
      id: "group",
      title: "A group",
      body: "In a group, click its name to rename it, and use ▲ ▼ to move it up or down the rail. Delete group asks yes or no first, and leaves the marks themselves in All.",
      targets: ["marks.grouphead"],
      enter: list(false),
    },
    {
      id: "order",
      title: "Order within a group",
      body: "Each mark has its own ▲ ▼ to set its place in the group; Show events and Compare follow that order.",
      targets: ["marks.row"],
      enter: list(false),
    },
    {
      id: "open",
      title: "Opening a mark again",
      body: "Open here selects the mark's event or volcano on the page you are on, moving to Active Earth when that page cannot show it. Open view goes back to the view it was marked in, window and all. Click a mark's name to rename it; Delete asks first.",
      targets: ["marks.row"],
      enter: list(false),
    },
    {
      id: "done",
      title: "That's marking",
      body: "Stacked panels, Compare and export each have a deep dive under Marks.",
      targets: ["help"],
      enter: showExample,
    },
  ],
};

export const MARKS_PANELS: Tour = {
  id: "marks-panels",
  title: "Stacked panels",
  blurb: "Every mark of a group as its full panel, one under another.",
  deep: { area: "Marks" },
  pageFor: () => "earthquakes",
  steps: [
    {
      id: "intro",
      title: "Show events",
      body: "Show events, at the head of a group, stacks the full panel of every mark in it, so a group reads as one long record. The steps use the Tour examples group.",
      targets: ["marks.grouphead"],
      enter: list(false),
    },
    {
      id: "panels",
      title: "The stack",
      body: "Each mark's panel in the group's order: an earthquake's origin, mechanism, impact and sequence, a volcano's GVP record, status, eruptions and nearby earthquakes, each read fresh, so it shows the latest the sources hold.",
      targets: ["marks.main"],
      enter: (ctx) => showMarks(ctx, "panels"),
    },
    {
      id: "open",
      title: "From a panel",
      body: "Each panel has its mark's name and Open here, which selects it on the page underneath (moving to Active Earth when that page cannot show it) and closes the marks.",
      targets: ["marks.main"],
      enter: (ctx) => showMarks(ctx, "panels"),
    },
    {
      id: "back",
      title: "Back to the list",
      body: "Back to list returns to the group's marks; × closes the marks and leaves the page underneath as it was.",
      targets: ["marks.main"],
      enter: (ctx) => showMarks(ctx, "panels"),
    },
    {
      id: "done",
      title: "That's stacked panels",
      body: "Every deep dive is in the Help menu, under Deep dives.",
      targets: ["help"],
      enter: showExample,
    },
  ],
};
