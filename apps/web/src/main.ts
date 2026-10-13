import { createApp, h } from "vue";
import { RouterView } from "vue-router";
import { createAppRouter } from "./router.js";
import "./styles.css";

createApp({ render: () => h(RouterView) })
  .use(createAppRouter())
  .mount("#app");
