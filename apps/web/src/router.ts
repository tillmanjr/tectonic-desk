import { createRouter, createWebHistory, type Router, type RouterHistory } from "vue-router";
import App from "./components/App.vue";

export type Page = "earthquakes" | "volcanoes" | "active" | "space";

/**
 * The shell renders every route; the page comes from the route's meta, the region from its param.
 * `/` lands on Active Earth. Links from before 2026-10-22 named the earthquakes page by region alone
 * (`/wc`), and saved marks may still, so a bare region redirects there with its query intact.
 */
export function createAppRouter(history: RouterHistory = createWebHistory()): Router {
  return createRouter({
    history,
    routes: [
      { path: "/active/:region?", component: App, meta: { page: "active" } },
      { path: "/volcanoes/:region?", component: App, meta: { page: "volcanoes" } },
      { path: "/earthquakes/:region?", component: App, meta: { page: "earthquakes" } },
      { path: "/space", component: App, meta: { page: "space" } },
      { path: "/", redirect: "/active" },
      {
        path: "/:region",
        redirect: (to) => ({ path: `/earthquakes/${String(to.params.region)}`, query: to.query }),
      },
      { path: "/:pathMatch(.*)*", redirect: "/active" },
    ],
  });
}

/** The base path of a page, to which the region is appended. */
export const pageBase = (page: Page): string => `/${page}`;

/** The page a route's `meta.page` names; anything else is the earthquakes page. */
export const pageOf = (meta: unknown): Page =>
  meta === "volcanoes" || meta === "active" || meta === "space" ? meta : "earthquakes";

/** Pages that show the volcano dataset and therefore load its store. */
export const hasVolcanoes = (page: Page): boolean => page === "volcanoes" || page === "active";

/** The Space page has no region, so its path never carries one. */
export const pagePath = (page: Page, region: string): string =>
  page === "space" || region === "global" ? pageBase(page) : `${pageBase(page)}/${region}`;
