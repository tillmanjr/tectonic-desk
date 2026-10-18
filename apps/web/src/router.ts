import { createRouter, createWebHistory, type Router, type RouterHistory } from "vue-router";
import App from "./components/App.vue";

export type Page = "earthquakes" | "volcanoes" | "active";

/** The shell renders every route; the page comes from the route's meta, the region from its param. */
export function createAppRouter(history: RouterHistory = createWebHistory()): Router {
  return createRouter({
    history,
    routes: [
      { path: "/active/:region?", component: App, meta: { page: "active" } },
      { path: "/volcanoes/:region?", component: App, meta: { page: "volcanoes" } },
      { path: "/:region?", component: App, meta: { page: "earthquakes" } },
      { path: "/:pathMatch(.*)*", redirect: "/" },
    ],
  });
}

/** The base path of a page, to which the region is appended. */
export const pageBase = (page: Page): string =>
  page === "volcanoes" ? "/volcanoes" : page === "active" ? "/active" : "";

/** The page a route's `meta.page` names; anything else is the earthquakes page. */
export const pageOf = (meta: unknown): Page =>
  meta === "volcanoes" || meta === "active" ? meta : "earthquakes";

/** Pages that show the volcano dataset and therefore load its store. */
export const hasVolcanoes = (page: Page): boolean => page !== "earthquakes";

export const pagePath = (page: Page, region: string): string =>
  region === "global" ? pageBase(page) || "/" : `${pageBase(page)}/${region}`;
