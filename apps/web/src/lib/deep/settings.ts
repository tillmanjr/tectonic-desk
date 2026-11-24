import type { StepContext, Tour } from "../tour.js";

/** The settings and the app-wide conventions: time zone, theme, hints and the Help menu. */

const openSettings = (ctx: StepContext): void => {
  ctx.setSwitch("settings", true);
};

export const SETTINGS_DIVE: Tour = {
  id: "settings",
  title: "Time zone, theme and hints",
  blurb:
    "UTC or local time, the theme, how hints appear with a mouse, a keyboard or a finger, and Help.",
  deep: { area: "Settings" },
  pageFor: (p) => (p === "space" ? "active" : p),
  steps: [
    {
      id: "intro",
      title: "Settings",
      body: "The ⚙ at the top right holds the two settings that apply to every page. It is open now.",
      targets: ["settings"],
      enter: openSettings,
    },
    {
      id: "zone",
      title: "Times",
      body: "UTC or your browser's own zone for every date and time in the app: the panels, tables, charts, the refine bars' dates and the Space window. The choice is kept in the address (tz=local), so a copied link shows times the way you had them; the panels give the other zone too where it matters.",
      targets: ["settings"],
      enter: openSettings,
    },
    {
      id: "theme",
      title: "Theme",
      body: "Auto follows your system's light or dark setting; Light and Dark hold one regardless. The choice is kept in this browser. Maps, charts and the field ramps are drawn for either.",
      targets: ["settings"],
      enter: openSettings,
    },
    {
      id: "hints",
      title: "Hints",
      body: "Almost every control explains itself. With a mouse, rest on it for a second and the hint appears below the pointer; with the keyboard, it appears under the control you move to. On a touch screen, hold a finger on the control for half a second: the hint shows above it, and lifting the finger does not press it. A tap on an ⓘ or a label shows its hint at once; the next touch dismisses it.",
      tryIt: "Rest the pointer on the lock in the map's corner.",
      targets: ["map.lock"],
    },
    {
      id: "touch",
      title: "On a touch screen",
      body: "A locked map lets one finger scroll the page and moves with two; unlocking it gives one finger the map. Markers keep a size a finger can hit however far you zoom out, and theater mode gives the map the whole screen.",
      targets: ["map.lock", "map.theater"],
    },
    {
      id: "help",
      title: "Help",
      body: "The ? holds the quick tours and these deep dives, each with how far you got. It stands out in colour while a quick tour has a step you have not seen, and Reset tour progress at its foot starts everything afresh.",
      targets: ["help"],
    },
    {
      id: "done",
      title: "That's every deep dive",
      body: "Each one stays in the Help menu, under Deep dives, for when you need it again.",
      targets: ["help"],
    },
  ],
};
