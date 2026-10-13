import { describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import { createAppRouter } from "../src/router.js";

describe("createAppRouter", () => {
  it("routes / and /:region to the app and redirects unknown depths to /", async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/wc");
    expect(router.currentRoute.value.params.region).toBe("wc");
    await router.push("/a/b/c");
    expect(router.currentRoute.value.path).toBe("/");
  });
});
