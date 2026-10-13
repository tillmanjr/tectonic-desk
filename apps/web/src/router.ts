import { createRouter, createWebHistory, type Router, type RouterHistory } from "vue-router";
import App from "./components/App.vue";

export function createAppRouter(history: RouterHistory = createWebHistory()): Router {
  return createRouter({
    history,
    routes: [
      { path: "/", component: App },
      { path: "/:region", component: App },
      { path: "/:pathMatch(.*)*", redirect: "/" },
    ],
  });
}
