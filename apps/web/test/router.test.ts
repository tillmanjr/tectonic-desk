import { describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import { createAppRouter, hasVolcanoes, pageBase, pageOf, pagePath } from "../src/router.js";

describe("createAppRouter", () => {
  it("lands on Active Earth, serves the earthquakes page under /earthquakes, and redirects old and unknown paths", async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/");
    expect(router.currentRoute.value.path).toBe("/active");
    expect(router.currentRoute.value.meta.page).toBe("active");
    await router.push("/earthquakes/wc");
    expect(router.currentRoute.value.meta.page).toBe("earthquakes");
    expect(router.currentRoute.value.params.region).toBe("wc");
    // a bare region is how links named the earthquakes page before 2026-10-22
    await router.push("/wc?event=us1");
    expect(router.currentRoute.value.fullPath).toBe("/earthquakes/wc?event=us1");
    await router.push("/a/b/c");
    expect(router.currentRoute.value.path).toBe("/active");
  });
  it("serves the Active Earth page under /active and knows which pages carry volcanoes", async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/active/wc");
    expect(router.currentRoute.value.meta.page).toBe("active");
    expect(router.currentRoute.value.params.region).toBe("wc");
    expect(pageBase("active")).toBe("/active");
    expect(pageBase("earthquakes")).toBe("/earthquakes");
    expect(pagePath("active", "global")).toBe("/active");
    expect(pagePath("active", "wc")).toBe("/active/wc");
    expect(pagePath("earthquakes", "global")).toBe("/earthquakes");
    expect(pagePath("volcanoes", "wc")).toBe("/volcanoes/wc");
    expect(pageOf("active")).toBe("active");
    expect(pageOf("volcanoes")).toBe("volcanoes");
    expect(pageOf(undefined)).toBe("earthquakes");
    expect(hasVolcanoes("earthquakes")).toBe(false);
    expect(hasVolcanoes("volcanoes")).toBe(true);
    expect(hasVolcanoes("active")).toBe(true);
  });
});
