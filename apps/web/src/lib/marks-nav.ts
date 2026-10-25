import { pagePath, type Page } from "../router.js";
import type { Mark, MarkKind } from "./marks.js";

/** Pages whose panels can show a mark's kind; the Space page has no panels. */
export const showsKind = (page: Page, kind: MarkKind): boolean =>
  page !== "space" && (kind === "event" ? page !== "volcanoes" : page !== "earthquakes");

export interface HereTarget {
  /** Path and query to push. */
  url: string;
  /** True when the page had to change to Active Earth. */
  switched: boolean;
}

/**
 * The current view with the mark's subject selected: the other selection key dropped, `event` or
 * `volcano` set to the mark's ref, region and every other key kept. When the page cannot show the
 * kind the path becomes Active Earth for the same region.
 */
export function hereTarget(
  page: Page,
  region: string,
  query: Record<string, string>,
  mark: Mark,
): HereTarget {
  const switched = !showsKind(page, mark.kind);
  const q = new URLSearchParams(query);
  q.delete("event");
  q.delete("volcano");
  q.set(mark.kind === "event" ? "event" : "volcano", mark.ref);
  const path = pagePath(switched ? "active" : page, region);
  return { url: `${path}?${q.toString()}`, switched };
}
