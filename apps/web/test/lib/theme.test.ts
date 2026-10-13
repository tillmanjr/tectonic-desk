import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { createTheme } from "../../src/lib/theme.js";

function media(matches: boolean) {
  const listeners: ((e: { matches: boolean }) => void)[] = [];
  return {
    matches,
    addEventListener: (_: "change", fn: (e: { matches: boolean }) => void) => {
      listeners.push(fn);
    },
    fire(m: boolean) {
      listeners.forEach((l) => {
        l({ matches: m });
      });
    },
  };
}
function storage(initial: string | null = null) {
  const data = new Map<string, string>();
  if (initial !== null) data.set("td-theme", initial);
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    data,
  };
}

describe("createTheme", () => {
  it("starts in auto, follows the media query and applies data-theme when forced", async () => {
    const m = media(false);
    const s = storage();
    const root = document.createElement("div");
    const theme = createTheme({ storage: s, media: m, root });
    expect(theme.mode.value).toBe("auto");
    expect(theme.resolved.value).toBe("light");
    m.fire(true);
    expect(theme.resolved.value).toBe("dark");
    theme.cycle();
    await nextTick();
    expect(theme.mode.value).toBe("light");
    expect(root.dataset.theme).toBe("light");
    expect(s.data.get("td-theme")).toBe("light");
    theme.cycle();
    await nextTick();
    expect(theme.resolved.value).toBe("dark");
    theme.cycle();
    await nextTick();
    expect(theme.mode.value).toBe("auto");
    expect(root.dataset.theme).toBeUndefined();
  });
  it("restores a stored mode and ignores junk", () => {
    const el = () => document.createElement("div");
    expect(
      createTheme({ storage: storage("dark"), media: media(false), root: el() }).mode.value,
    ).toBe("dark");
    expect(
      createTheme({ storage: storage("blue"), media: media(false), root: el() }).mode.value,
    ).toBe("auto");
  });
  it("survives a storage that throws or is absent", () => {
    const bad = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    const t = createTheme({
      storage: bad,
      media: media(false),
      root: document.createElement("div"),
    });
    expect(() => {
      t.set("dark");
    }).not.toThrow();
    const none = createTheme({
      storage: null,
      media: media(true),
      root: document.createElement("div"),
    });
    expect(none.resolved.value).toBe("dark");
  });
  it("uses window defaults", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => undefined }));
    const t = createTheme();
    expect(t.mode.value).toBe("auto");
    t.set("auto");
    vi.unstubAllGlobals();
  });
});
