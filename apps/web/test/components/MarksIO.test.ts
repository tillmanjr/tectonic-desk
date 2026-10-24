import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import MarksIO, { RESULT_MS } from "../../src/components/MarksIO.vue";
import { exportDocument, type MarkDraft } from "../../src/lib/marks.js";
import { makeContext, mountWith } from "../support/mount.js";

const quake: MarkDraft = {
  kind: "event",
  ref: "us1",
  name: "Kuril shock",
  url: "/earthquakes/wc?event=us1",
  frame: "wc",
  lon: -122,
  lat: 37,
  headline: "M5.5 mww",
  sub: "10 km N of Somewhere",
  stamp: "2026-10-13T10:00:00.000Z",
  mag: 5.5,
  depthKm: 10,
};

/** Feeds a file to the hidden input and fires change. */
async function pick(w: ReturnType<typeof mountWith>, text: string, name = "marks.json") {
  const input = w.find<HTMLInputElement>("input[type=file]");
  const file = new File([text], name, { type: "application/json" });
  Object.defineProperty(input.element, "files", { value: [file], configurable: true });
  await input.trigger("change");
  await flushPromises();
}

describe("MarksIO", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("downloads the document as a dated JSON file", async () => {
    const ctx = await makeContext();
    ctx.marks.add(quake);
    const create = vi.fn<(blob: Blob) => string>(() => "blob:marks");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe("tectonic-marks-2026-10-13.json");
        expect(this.href).toContain("blob:marks");
      });
    const w = mountWith(MarksIO, ctx);
    await w.find(".export").trigger("click");
    expect(click).toHaveBeenCalledTimes(1);
    const blob = create.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    if (!(blob instanceof Blob)) throw new Error("no blob");
    expect(await blob.text()).toBe(exportDocument(ctx.marks.document(), ctx.now));
    expect(revoke).toHaveBeenCalledWith("blob:marks");
    w.unmount();
  });

  it("imports by merge, reports, and clears the report after a while", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const ctx = await makeContext();
    const a = ctx.marks.add(quake);
    const file = exportDocument(
      {
        marks: [
          { ...quake, id: "x", ref: "us2", createdAt: "2026-10-01T00:00:00.000Z" },
          { ...quake, id: a.id, createdAt: a.createdAt },
        ],
        groups: [{ id: "g", name: "G", marks: ["x", a.id] }],
      },
      ctx.now,
    );
    const w = mountWith(MarksIO, ctx);
    const input = w.find<HTMLInputElement>("input[type=file]");
    const click = vi.spyOn(input.element, "click").mockImplementation(() => undefined);
    await w.find(".import").trigger("click");
    expect(click).toHaveBeenCalledTimes(1);
    await pick(w, file);
    expect(w.find(".io-strip").text()).toContain("marks.json: 2 marks, 1 group");
    await w.find(".merge").trigger("click");
    expect(ctx.marks.marks.value.map((m) => m.id)).toEqual([a.id, "x"]);
    expect(ctx.marks.groups.value).toEqual([{ id: "g", name: "G", marks: ["x", a.id] }]);
    expect(w.find(".io-result").text()).toBe("Added 1 mark, 1 group");
    vi.advanceTimersByTime(RESULT_MS);
    await flushPromises();
    expect(w.find(".io-result").exists()).toBe(false);
    expect(w.find(".export").exists()).toBe(true);
    w.unmount();
  });

  it("replaces after an inline confirm, cancels, and refuses a file with nothing in it", async () => {
    const ctx = await makeContext();
    ctx.marks.add(quake);
    const file = exportDocument(
      { marks: [{ ...quake, id: "y", createdAt: "2026-10-01T00:00:00.000Z" }], groups: [] },
      ctx.now,
    );
    const w = mountWith(MarksIO, ctx);
    await pick(w, file);
    await w.find(".cancel").trigger("click");
    expect(w.find(".io-strip").exists()).toBe(false);
    expect(ctx.marks.marks.value).toHaveLength(1);
    await pick(w, file);
    await w.find(".replace > button").trigger("click");
    await w.find(".replace button.yes").trigger("click");
    expect(ctx.marks.marks.value.map((m) => m.id)).toEqual(["y"]);
    expect(w.find(".io-result").text()).toBe("Replaced with 1 mark, 0 groups");
    await pick(w, "not json", "notes.txt");
    expect(w.find(".io-result").text()).toBe("Not a marks file");
    await pick(w, "{}", "empty.json");
    expect(w.find(".io-result").text()).toBe("Not a marks file");
    w.unmount();
  });

  it("ignores a change event with no file", async () => {
    const ctx = await makeContext();
    const w = mountWith(MarksIO, ctx);
    const input = w.find<HTMLInputElement>("input[type=file]");
    Object.defineProperty(input.element, "files", { value: [], configurable: true });
    await input.trigger("change");
    await flushPromises();
    expect(w.find(".io-strip").exists()).toBe(false);
    expect(w.find(".io-result").exists()).toBe(false);
    w.unmount();
  });
});
