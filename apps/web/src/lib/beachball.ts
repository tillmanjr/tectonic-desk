import {
  axesFromTensor,
  directionAt,
  projectAxis,
  radiation,
  storedAxes,
  tensorOf,
  type Axis,
  type MechanismGeometry,
  type Tensor,
} from "@tectonic/shared";
import { color as parseColor } from "d3-color";
import {
  axisOnBowl,
  bowlTexture,
  bowlView,
  onScreen,
  PLAN_TILT,
  rasterBowl,
  rasterPlan,
  type BowlSample,
  type Rgb3,
} from "./bowl.js";

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
    for (const [label, axis] of axisPairs(axes)) {
      const [east, north] = projectAxis(axis);
      axisMark(g, n, n / 2 + east * r0, n / 2 - north * r0, label, ink.css, tension.css, true);
    }
  }
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

const axisPairs = (axes: { t: Axis; p: Axis }): (readonly ["T" | "P", Axis])[] => [
  ["T", axes.t],
  ["P", axes.p],
];

/** A T or P mark: filled in `ink`, or a dashed ring when the near rim of a tilted bowl hides it. */
function axisMark(
  g: CanvasRenderingContext2D,
  n: number,
  cx: number,
  cy: number,
  label: string,
  ink: string,
  paper: string,
  visible: boolean,
): void {
  g.font = `600 ${String(n / 11)}px "IBM Plex Mono", monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.beginPath();
  g.arc(cx, cy, n / 15, 0, 2 * Math.PI);
  if (visible) {
    g.fillStyle = ink;
    g.fill();
    g.fillStyle = paper;
  } else {
    g.setLineDash([n / 60, n / 80]);
    g.lineWidth = n / 120;
    g.strokeStyle = ink;
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = ink;
  }
  g.fillText(label, cx, cy + 1);
}

export interface BowlBallColors extends BeachballColors {
  /** The bowl's underside, seen while it is tilted. */
  under: string;
}

/** What a bowl beachball needs for every frame: its tensor, axes, colours and the shaded texture. */
export interface BowlScene {
  tensor: Tensor;
  axes: { t: Axis; p: Axis };
  texture: BowlSample[];
  fill: Rgb3;
  tension: Rgb3;
  ink: string;
  paper: string;
  /** The canvas side in device pixels (twice `px`) and the rim radius in the plan view. */
  n: number;
  r0: number;
}

const rgb3 = (c: Rgb): Rgb3 => [c.r, c.g, c.b];

/**
 * The bowl beachball for a mechanism at `px` css pixels, or null when it has no tensor. Building
 * it shades the texture once; `drawBowl` then draws any tilt from it.
 */
export function bowlScene(
  m: MechanismGeometry,
  px: number,
  colors: BowlBallColors,
): BowlScene | null {
  const tensor = tensorOf(m);
  if (tensor === null) return null;
  const n = px * 2;
  const r0 = n / 2 - 3;
  const fill = rgb3(rgb(colors.fill));
  const tension = rgb(colors.tension);
  return {
    tensor,
    axes: storedAxes(m) ?? axesFromTensor(tensor),
    texture: bowlTexture(tensor, Math.ceil(r0 * 2.6), {
      fill,
      tension: rgb3(tension),
      under: rgb3(rgb(colors.under)),
    }),
    fill,
    tension: rgb3(tension),
    ink: rgb(colors.ink).css,
    paper: tension.css,
    n,
    r0,
  };
}

/**
 * Draws the bowl at `tiltDeg` (positive from the south, negative from the north) onto a canvas of
 * the scene's size; near 0 it is the equal-area plot, shaded.
 */
export function drawBowl(g: CanvasRenderingContext2D, scene: BowlScene, tiltDeg: number): void {
  const { n, r0 } = scene;
  const img = g.createImageData(n, n);
  g.clearRect(0, 0, n, n);
  g.lineWidth = Math.max(1.2, n / 70);
  if (Math.abs(tiltDeg) < PLAN_TILT) {
    rasterPlan(img.data, n, r0, scene.tensor, scene);
    g.putImageData(img, 0, 0);
    g.beginPath();
    g.arc(n / 2, n / 2, r0, 0, 2 * Math.PI);
    g.strokeStyle = scene.ink;
    g.stroke();
    for (const [label, axis] of axisPairs(scene.axes)) {
      const [east, north] = projectAxis(axis);
      axisMark(g, n, n / 2 + east * r0, n / 2 - north * r0, label, scene.ink, scene.paper, true);
    }
    return;
  }
  const view = bowlView(tiltDeg, n, r0);
  const zbuf = rasterBowl(img.data, scene.texture, view);
  g.putImageData(img, 0, 0);
  g.beginPath();
  for (let i = 0; i <= 120; i++) {
    const th = (i / 120) * 2 * Math.PI;
    const [x, y] = onScreen(view, [Math.cos(th), Math.sin(th), 0]);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.strokeStyle = scene.ink;
  g.stroke();
  for (const [label, axis] of axisPairs(scene.axes)) {
    const at = axisOnBowl(axis, view, zbuf);
    axisMark(g, n, at.x, at.y, label, scene.ink, scene.paper, at.visible);
  }
}
