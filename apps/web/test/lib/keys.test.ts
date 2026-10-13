import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineComponent, h, provide } from "vue";
import { SELECT, useInjected } from "../../src/lib/keys.js";

describe("useInjected", () => {
  it("returns the provided value or throws naming the key", () => {
    const Child = defineComponent({
      setup: () => {
        const s = useInjected(SELECT);
        return () => h("span", typeof s);
      },
    });
    const Parent = defineComponent({
      setup: () => {
        provide(SELECT, () => undefined);
        return () => h(Child);
      },
    });
    expect(mount(Parent).text()).toBe("function");
    expect(() => mount(Child)).toThrow("select");
  });
});
