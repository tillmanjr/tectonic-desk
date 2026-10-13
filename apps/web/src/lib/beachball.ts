import {
  axesFromTensor,
  directionAt,
  projectAxis,
  radiation,
  storedAxes,
  tensorOf,
  type MechanismGeometry,
} from "@tectonic/shared";
import { color as parseColor } from "d3-color";

export interface BeachballColors {
  fill: string;
  tension: string;
  ink: string;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
  css: string;
}

const cache = new Map<string, string>();

export function clearBeachballCache(): void {
  cache.clear();
}

function rgb(s: string): Rgb {
  const c = parseColor(s);
  if (c === null) return { r: 0, g: 0, b: 0, css: "#000" };
  const o = c.rgb();
  return { r: o.r, g: o.g, b: o.b, css: o.formatRgb() };
}

/**
 * A lower-hemisphere equal-area beachball as a PNG data URL, rendered at
 * twice `px` for sharpness. Compressional quadrants take `fill`, dilatational
 * take `tension`; the rim and the T/P markers take `ink`. Empty string when
 * the mechanism has no tensor or the canvas has no 2D context.
 */
export function beachballUrl(
  m: MechanismGeometry,
  px: number,
  colors: BeachballColors,
  showAxes: boolean,
): string {
  const tensor = tensorOf(m);
  if (tensor === null) return "";
  const key = [
    m.strike1,
    m.dip1,
    m.rake1,
    m.tAzimuth,
    m.tPlunge,
    m.pAzimuth,
    m.pPlunge,
    px,
    colors.fill,
    colors.tension,
    colors.ink,
    showAxes,
  ].join("|");
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const scale = 2;
  const n = px * scale;
  const canvas = document.createElement("canvas");
  canvas.width = n;
  canvas.height = n;
  const g = canvas.getContext("2d");
  if (g === null) return "";
  const fill = rgb(colors.fill);
  const tension = rgb(colors.tension);
  const ink = rgb(colors.ink);
  const r0 = n / 2 - 1.5 * scale;

  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = directionAt((x + 0.5 - n / 2) / r0, (n / 2 - y - 0.5) / r0);
      if (v === null) continue;
      const c = radiation(tensor, v) > 0 ? fill : tension;
      const k = (y * n + x) * 4;
      img.data[k] = c.r;
      img.data[k + 1] = c.g;
      img.data[k + 2] = c.b;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.beginPath();
  g.arc(n / 2, n / 2, r0, 0, 2 * Math.PI);
  g.lineWidth = Math.max(1.2, n / 70);
  g.strokeStyle = ink.css;
  g.stroke();

  if (showAxes) {
    const axes = storedAxes(m) ?? axesFromTensor(tensor);
    g.font = `600 ${String(n / 11)}px "IBM Plex Mono", monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const [label, axis] of [
      ["T", axes.t],
      ["P", axes.p],
    ] as const) {
      const [east, north] = projectAxis(axis);
      const cx = n / 2 + east * r0;
      const cy = n / 2 - north * r0;
      g.beginPath();
      g.arc(cx, cy, n / 15, 0, 2 * Math.PI);
      g.fillStyle = ink.css;
      g.fill();
      g.fillStyle = tension.css;
      g.fillText(label, cx, cy + 1);
    }
  }
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}
