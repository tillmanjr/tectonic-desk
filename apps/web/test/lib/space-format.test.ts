import { describe, expect, it } from "vitest";
import {
  alertKind,
  alertTitle,
  fmtKp,
  fmtValue,
  fromInputValue,
  gLevel,
  minutesBetween,
  scaleClass,
  toInputValue,
  xrayClass,
} from "../../src/lib/space-format.js";
import { alert } from "../support/space.js";

describe("space formatting", () => {
  it("names GOES classes from flux", () => {
    expect(xrayClass(4.2e-6)).toBe("C4.2");
    expect(xrayClass(1.3e-5)).toBe("M1.3");
    expect(xrayClass(1.23e-3)).toBe("X12.3");
    expect(xrayClass(5e-7)).toBe("B5.0");
    expect(xrayClass(3e-8)).toBe("A3.0");
    expect(xrayClass(0)).toBe("—");
    expect(xrayClass(null)).toBe("—");
    expect(xrayClass(Number.NaN)).toBe("—");
  });

  it("maps Kp to G levels and writes Kp in thirds", () => {
    expect([0, 4.33, 4.67, 5.33, 6, 7, 8, 8.67, 9].map(gLevel)).toEqual([
      0, 0, 1, 1, 2, 3, 4, 4, 5,
    ]);
    expect([0, 0.33, 0.67, 2.33, 2.67, 4, 4.67, 9].map(fmtKp)).toEqual([
      "0",
      "0+",
      "1-",
      "2+",
      "3-",
      "4",
      "5-",
      "9",
    ]);
    expect([null, -1, 0, 1, 3, 5, 7].map(scaleClass)).toEqual([
      "lv0",
      "lv0",
      "lv0",
      "lv1",
      "lv3",
      "lv5",
      "lv5",
    ]);
  });

  it("lifts the headline out of a SWPC message", () => {
    expect(alertTitle(alert().message)).toBe("WARNING: Geomagnetic K-index of 5 expected");
    expect(alertTitle("Code: X\r\nSerial: 1\r\n\r\n\r\n  ALERT: Something  \nMore")).toBe(
      "ALERT: Something",
    );
    expect(alertTitle("Just one line")).toBe("Just one line");
    expect(alertTitle("Header only\r\n\r\n")).toBe("Header only");
    expect(alertTitle("")).toBe("");
    expect(alertKind("WARNING: Geomagnetic K-index of 5 expected")).toBe("warning");
    expect(alertKind("EXTENDED WARNING: Geomagnetic K-index of 4 expected")).toBe("warning");
    expect(alertKind("ALERT: Electron 2MeV Integral Flux exceeded 1000pfu")).toBe("alert");
    expect(alertKind("CONTINUED ALERT: Proton Event 10MeV Integral Flux")).toBe("alert");
    expect(alertKind("WATCH: Geomagnetic Storm Category G3 Predicted")).toBe("watch");
    expect(alertKind("SUMMARY: Geomagnetic Sudden Impulse")).toBe("summary");
    expect(alertKind("Space Weather Message Code: WARK05")).toBe("other");
  });

  it("round-trips datetime-local values in UTC and in the browser zone", () => {
    const d = new Date("2026-10-13T04:05:00Z");
    expect(toInputValue(d, "utc")).toBe("2026-10-13T04:05");
    expect(fromInputValue("2026-10-13T04:05", "utc")).toEqual(d);
    const local = toInputValue(d, "local");
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromInputValue(local, "local")).toEqual(d);
    expect(fromInputValue("2026-10-13", "utc")).toBeNull();
    expect(fromInputValue("2026-13-45T99:99", "utc")).toEqual(
      new Date(Date.UTC(2026, 12, 45, 99, 99)),
    );
    expect(minutesBetween(d, new Date("2026-10-13T05:35:20Z"))).toBe(90);
    expect(fmtValue(7)).toBe("7");
    expect(fmtValue(7.123)).toBe("7.1");
    expect(fmtValue(7.126, 2)).toBe("7.13");
    expect(fmtValue(0.1, 2)).toBe("0.1");
    expect(fmtValue(-6.2)).toBe("-6.2");
  });
});
