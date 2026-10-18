import { describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import { createAppRouter, hasVolcanoes, pageBase, pageOf, pagePath } from "../src/router.js";

describe("createAppRouter", () => {
  it("routes / and /:region to the app and redirects unknown depths to /", async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/wc");
    expect(router.currentRoute.value.params.region).toBe("wc");
    await router.push("/a/b/c");
    expect(router.currentRoute.value.path).toBe("/");
  });
  it("serves the Active Earth page under /active and knows which pages carry volcanoes", async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/active/wc");
    expect(router.currentRoute.value.meta.page).toBe("active");
    expect(router.currentRoute.value.params.region).toBe("wc");
    expect(pageBase("active")).toBe("/active");
    expect(pagePath("active", "global")).toBe("/active");
    expect(pagePath("active", "wc")).toBe("/active/wc");
    expect(pageOf("active")).toBe("active");
    expect(pageOf("volcanoes")).toBe("volcanoes");
    expect(pageOf(undefined)).toBe("earthquakes");
    expect(hasVolcanoes("earthquakes")).toBe(false);
    expect(hasVolcanoes("volcanoes")).toBe(true);
    expect(hasVolcanoes("active")).toBe(true);
  });
});
