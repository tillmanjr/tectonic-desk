import { mount } from "@vue/test-utils";
import { geoPath } from "d3-geo";
import { describe, expect, it } from "vitest";
import MapSection from "../../src/components/MapSection.vue";
import { frameFor } from "../../src/lib/geo.js";
import { WC } from "../support/events.js";

const frame = frameFor(WC);
const path = geoPath(frame.projection);

describe("MapSection", () => {
  it("draws nothing with neither a section nor a pending point", () => {
    const w = mount(MapSection, {
      props: { frame, path, k: 1, section: null, pending: null, cursor: null },
    });
    expect(w.findAll("path")).toHaveLength(0);
    expect(w.findAll(".handle")).toHaveLength(0);
  });

  it("shows the first point and the rubber line while placing", () => {
    const w = mount(MapSection, {
      props: { frame, path, k: 2, section: null, pending: [-122, 40], cursor: [-118, 36] },
    });
    expect(w.findAll(".handle")).toHaveLength(1);
    expect(w.find(".slabel").text()).toBe("A");
    expect(w.find(".handle").attributes("r")).toBe("3.5");
    expect(w.find(".rubber").exists()).toBe(true);
    expect(w.find(".corridor").exists()).toBe(false);
  });

  it("skips a handle whose end the projection cannot place", () => {
    const projection = Object.assign(
      (ll: [number, number]) => (ll[0] === 100 ? null : frame.projection(ll)),
      frame.projection,
    );
    const w = mount(MapSection, {
      props: {
        frame: { ...frame, projection },
        path,
        k: 1,
        section: { a: [-122, 40], b: [100, 0], halfKm: 50 },
        pending: null,
        cursor: null,
      },
    });
    expect(w.findAll(".handle")).toHaveLength(1);
    expect(w.find(".corridor").exists()).toBe(true);
    expect(w.find(".sline").exists()).toBe(true);
  });
});
