import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The browser's own tooltip (a `title` attribute, or `<title>` inside an svg) shows under the
 * pointer, with a delay nobody controls, and never on touch. Every hint goes through `v-hint`.
 */
const DIR = join(import.meta.dirname, "../../src/components");
const NATIVE = /\s:?title=|<title[\s>]/;

describe("tooltips", () => {
  it("never uses the browser's own tooltip in a component", () => {
    const offenders: string[] = [];
    for (const f of readdirSync(DIR).filter((n) => n.endsWith(".vue"))) {
      const lines = readFileSync(join(DIR, f), "utf8").split("\n");
      lines.forEach((line, i) => {
        if (NATIVE.test(line)) offenders.push(`${f}:${String(i + 1)}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
