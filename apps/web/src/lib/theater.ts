/** The body's class while a map is in theater mode. */
export const IN_THEATER = "in-theater";
/** The root's class while Settings → Theater mode event details is on: the side panels show over the map. */
export const THEATER_DETAILS = "theater-details";

/** Whether a side panel would be drawn over a theater-mode map now. */
export function panelsOverTheater(): boolean {
  return (
    document.body.classList.contains(IN_THEATER) &&
    document.documentElement.classList.contains(THEATER_DETAILS)
  );
}
