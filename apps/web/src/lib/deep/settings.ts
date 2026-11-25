import type { StepContext, Tour } from "../tour.js";

/** The settings and the app-wide conventions: time zone, theme, hints, the ◆ marks and where help lives. */

const openSettings = (ctx: StepContext): void => {
  ctx.setSwitch("settings", true);
};

export const SETTINGS_DIVE: Tour = {
  id: "settings",
  title: "Time zone, theme and hints",
  blurb:
    "UTC or local time, the theme, the beachball, the ◆ marks, how hints appear with a mouse, a keyboard or a finger, and where help lives.",
  deep: { area: "Settings" },
  pageFor: (p) => (p === "space" ? "active" : p),
  steps: [
    {
      id: "intro",
      title: "Settings",
      body: "The ⚙ at the top right holds the settings that apply to every page. It is open now.",
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
      id: "beachball",
      title: "Beachball",
      body: "Flat draws the event panel's mechanism as the usual lower-hemisphere, equal-area plot. Bowl shades it as the inside of the focal sphere, so it reads as looking down into it rather than at a dome: it opens tilted 30°, settles to the plan view, and a slider under it tilts it again. Only the panel changes; the map's beachballs, the cards and the mark thumbnails stay flat. The choice is kept in this browser.",
      targets: ["settings"],
      enter: openSettings,
    },
    {
      id: "marks",
      title: "Deep dive marks",
      body: "A small orange ◆ on a part of the desk (a refine bar, the map's header, a panel, the charts, the Space rows) lists the deep dives about that part. It fades once you have taken all of them. Deep dive marks turns them off, and on again; the choice is kept in this browser.",
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
      title: "Help and the Field manual",
      body: "The ? holds the quick tours, each with how far you got; it stands out in colour while one has a step you have not seen, and Reset tour progress at its foot starts everything afresh. The Field manual, at the end of the page links, holds every deep dive, a chapter to each part of the desk, with the quick tours in its introduction.",
      targets: ["help", "manual"],
    },
    {
      id: "done",
      title: "That's every deep dive",
      body: "Each one stays in the Field manual for when you need it again.",
      targets: ["manual"],
    },
  ],
};
