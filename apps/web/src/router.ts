import { createRouter, createWebHistory, type Router, type RouterHistory } from "vue-router";
import App from "./components/App.vue";

export type Page = "earthquakes" | "volcanoes";

/** The shell renders every route; the page comes from the route's meta, the region from its param. */
export function createAppRouter(history: RouterHistory = createWebHistory()): Router {
  return createRouter({
    history,
    routes: [
      { path: "/volcanoes/:region?", component: App, meta: { page: "volcanoes" } },
      { path: "/:region?", component: App, meta: { page: "earthquakes" } },
      { path: "/:pathMatch(.*)*", redirect: "/" },
    ],
  });
}

/** The base path of a page, to which the region is appended. */
export const pageBase = (page: Page): string => (page === "volcanoes" ? "/volcanoes" : "");

export const pagePath = (page: Page, region: string): string =>
  region === "global" ? pageBase(page) || "/" : `${pageBase(page)}/${region}`;
