import { projectAxis, radiation, type Axis, type Tensor, type Vec3 } from "@tectonic/shared";

/**
 * The beachball drawn as the inside of a bowl: the lower focal sphere seen from above, shaded as
 * a concave surface lit from the upper left, so it reads as looking down into the sphere rather
 * than at a dome. The bowl is a height field over the equal-area disc (a disc point at radius r
 * sits at depth `BOWL_DEPTH · cos i(r)`), so seen straight down it is the equal-area plot pixel
 * for pixel; tilted, the same plot stands up as a dish. Vectors are [north, east, down], as in
 * `@tectonic/shared`'s mechanism maths.
 */

export type Rgb3 = readonly [number, number, number];

/** The tilt the panel opens at, in degrees; positive looks from the south. */
export const BOWL_TILT = 30;
/** The slider's reach either way. */
export const BOWL_MAX_TILT = 60;
/** How long the opening tilt holds before it eases to the plan view, and how long the ease runs. */
export const BOWL_HOLD_MS = 700;
export const BOWL_SETTLE_MS = 2200;
/** Depth of the bowl's floor below its rim, in rim radii. */
export const BOWL_DEPTH = 0.9;
/** Below this tilt the plan view is drawn, which is the equal-area plot exactly. */
export const PLAN_TILT = 0.05;

const RAD = Math.PI / 180;
const LIGHT_AZIMUTH = 315;
const LIGHT_ELEVATION = 42;
const AMBIENT = 0.5;
const DIFFUSE = 0.62;
/** How much less sky reaches the rim than the floor. */
const SKY = 0.22;
/** What is left of the direct light inside the rim's shadow. */
const SHADOWED = 0.12;
const MAX_SHADE = 1.1;

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Directions towards the light, a few degrees apart so the rim's shadow has a soft edge. */
export const BOWL_LIGHTS: readonly Vec3[] = (
  [
    [0, 0],
    [5, 0],
    [-5, 0],
    [0, 4],
    [0, -4],
  ] as const
).map(([da, de]): Vec3 => {
  const az = (LIGHT_AZIMUTH + da) * RAD;
  const el = (LIGHT_ELEVATION + de) * RAD;
  return [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), -Math.sin(el)];
});

const FLOOR_LIGHT = AMBIENT + DIFFUSE * Math.sin(LIGHT_ELEVATION * RAD);

/**
 * Lightness factor for the inside of the bowl where the ray `v` meets it: diffuse light on the
 * inward normal −v, the shadow the rim casts (the way back to the light leaves through the wall,
 * not the open top), and less sky towards the rim. Normalised to a floor in full light; with the
 * light under 45° the rim shades the floor as well, so only the wall facing the light reaches 1.
 */
export function insideShade(v: Vec3): number {
  let lit = 0;
  for (const l of BOWL_LIGHTS) {
    const along = dot(v, l);
    if (along >= 0) continue;
    // where the ray from v towards the light leaves the unit sphere: below the rim is the wall
    const exitDown = v[2] - 2 * along * l[2];
    lit += -along * (exitDown > 0 ? SHADOWED : 1);
  }
  lit /= BOWL_LIGHTS.length;
  const sky = 1 - SKY * (1 - v[2]);
  return Math.min(MAX_SHADE, (AMBIENT * sky + DIFFUSE * lit) / FLOOR_LIGHT);
}

/** Lightness factor for the bowl's underside, whose outward normal is −`nIn`. */
export function outsideShade(nIn: Vec3): number {
  let lit = 0;
  for (const l of BOWL_LIGHTS) lit += Math.max(0, -dot(nIn, l));
  return 0.7 + (0.5 * lit) / BOWL_LIGHTS.length;
}

export interface BowlPoint {
  /** The surface point. */
  p: Vec3;
  /** The ray from the source through the disc point, as the equal-area plot reads it. */
  v: Vec3;
  /** The unit normal on the inside of the bowl, pointing up and in. */
  nIn: Vec3;
}

/** The bowl under the disc point (east, north), for a point inside the unit disc. */
export function bowlAt(east: number, north: number): BowlPoint {
  const r = Math.min(1, Math.hypot(east, north));
  const inc = 2 * Math.asin(r / Math.SQRT2);
  const az = Math.atan2(east, north);
  const v: Vec3 = [Math.sin(inc) * Math.cos(az), Math.sin(inc) * Math.sin(az), Math.cos(inc)];
  // d(depth)/dr = −BOWL_DEPTH · sin i · di/dr, with di/dr = √2 / √(1 − r²/2)
  const slope = -BOWL_DEPTH * Math.sin(inc) * (Math.SQRT2 / Math.sqrt(1 - (r * r) / 2));
  const gn = slope * Math.cos(az);
  const ge = slope * Math.sin(az);
  const len = Math.hypot(gn, ge, 1);
  return { p: [north, east, BOWL_DEPTH * v[2]], v, nIn: [gn / len, ge / len, -1 / len] };
}

export interface BowlView {
  /** Unit vectors of the screen's right and up, and the direction the eye looks. */
  right: Vec3;
  up: Vec3;
  toward: Vec3;
  /** Pixels per rim radius, and the screen row of the figure's highest point. */
  scale: number;
  offset: number;
  top: number;
  n: number;
}

/**
 * An orthographic view of the bowl, `tiltDeg` off vertical (positive from the south, negative
 * from the north), fitted into an n-pixel square: the scale is the plan view's rim radius `r0`
 * unless the tilted figure would be taller than the plan view.
 */
export function bowlView(tiltDeg: number, n: number, r0: number): BowlView {
  const t = tiltDeg * RAD;
  const up: Vec3 = [Math.cos(t), 0, -Math.sin(t)];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = -60; i <= 60; i++) {
    const s = dot(bowlAt(0, i / 60).p, up);
    lo = Math.min(lo, s);
    hi = Math.max(hi, s);
  }
  const scale = Math.min(r0, r0 * (2 / (hi - lo)));
  return {
    right: [0, 1, 0],
    up,
    toward: [Math.sin(t), 0, Math.cos(t)],
    scale,
    offset: (n - (hi - lo) * scale) / 2,
    top: hi,
    n,
  };
}

/** Where a surface point lands on the screen, in pixels from the top left. */
export function onScreen(view: BowlView, p: Vec3): [number, number] {
  return [
    view.n / 2 + dot(p, view.right) * view.scale,
    view.offset + (view.top - dot(p, view.up)) * view.scale,
  ];
}

export interface BowlColors {
  fill: Rgb3;
  tension: Rgb3;
  under: Rgb3;
}

/** One sample of the bowl, with its colour already shaded for each side. */
export interface BowlSample {
  p: Vec3;
  nIn: Vec3;
  /** Seen from inside the bowl, and from under it. */
  inner: Rgb3;
  outer: Rgb3;
}

const shaded = (c: Rgb3, f: number): Rgb3 => [c[0] * f, c[1] * f, c[2] * f];

/**
 * The bowl sampled on a grid over the disc, `per` samples across it. It does not depend on the
 * tilt, so one serves every frame of the settle.
 */
export function bowlTexture(tensor: Tensor, per: number, colors: BowlColors): BowlSample[] {
  const out: BowlSample[] = [];
  for (let j = 0; j < per; j++) {
    for (let i = 0; i < per; i++) {
      const e = (2 * (i + 0.5)) / per - 1;
      const nn = 1 - (2 * (j + 0.5)) / per;
      if (e * e + nn * nn > 1) continue;
      const b = bowlAt(e, nn);
      const c = radiation(tensor, b.v) > 0 ? colors.fill : colors.tension;
      out.push({
        p: b.p,
        nIn: b.nIn,
        inner: shaded(c, insideShade(b.v)),
        outer: shaded(colors.under, outsideShade(b.nIn)),
      });
    }
  }
  return out;
}

/** The depth drawn at pixel `q`; outside the buffer nothing is drawn, so it is infinitely far. */
export function depthAt(zbuf: Float32Array, q: number): number {
  return zbuf[q] ?? Infinity;
}

/**
 * Splats the samples into RGBA `data` (n × n) through the view, nearest surface winning, and
 * returns the depth buffer so marks can tell whether they are hidden behind the rim.
 */
export function rasterBowl(
  data: Uint8ClampedArray,
  samples: readonly BowlSample[],
  view: BowlView,
): Float32Array {
  const n = view.n;
  const zbuf = new Float32Array(n * n).fill(Infinity);
  for (const s of samples) {
    const src = dot(s.nIn, view.toward) < 0 ? s.inner : s.outer;
    const [x, y] = onScreen(view, s.p);
    const z = dot(s.p, view.toward);
    for (let oy = 0; oy < 2; oy++) {
      for (let ox = 0; ox < 2; ox++) {
        const q = Math.floor(y + oy - 0.5) * n + Math.floor(x + ox - 0.5);
        if (z >= depthAt(zbuf, q)) continue;
        zbuf[q] = z;
        data.set(src, q * 4);
        data[q * 4 + 3] = 255;
      }
    }
  }
  return zbuf;
}

/**
 * The plan view: the equal-area plot, every pixel shaded as the inside of the bowl. `r0` is the
 * rim radius in pixels.
 */
export function rasterPlan(
  data: Uint8ClampedArray,
  n: number,
  r0: number,
  tensor: Tensor,
  colors: Pick<BowlColors, "fill" | "tension">,
): void {
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const e = (x + 0.5 - n / 2) / r0;
      const nn = (n / 2 - y - 0.5) / r0;
      if (e * e + nn * nn > 1) continue;
      const { v } = bowlAt(e, nn);
      const c = radiation(tensor, v) > 0 ? colors.fill : colors.tension;
      const f = insideShade(v);
      const k = (y * n + x) * 4;
      data[k] = c[0] * f;
      data[k + 1] = c[1] * f;
      data[k + 2] = c[2] * f;
      data[k + 3] = 255;
    }
  }
}

/** Where an axis's mark sits on the tilted bowl, and whether the near rim hides it. */
export function axisOnBowl(
  axis: Axis,
  view: BowlView,
  zbuf: Float32Array,
): { x: number; y: number; visible: boolean } {
  const [east, north] = projectAxis(axis);
  const b = bowlAt(east, north);
  const [x, y] = onScreen(view, b.p);
  const n = view.n;
  const q =
    Math.min(n - 1, Math.max(0, Math.round(y))) * n + Math.min(n - 1, Math.max(0, Math.round(x)));
  const facing = dot(b.nIn, view.toward) < 0;
  return { x, y, visible: facing && dot(b.p, view.toward) <= depthAt(zbuf, q) + 0.03 };
}

/** The tilt at `elapsedMs` into the settle: held at `from`, then eased in and out to 0. */
export function settleTilt(elapsedMs: number, from = BOWL_TILT): number {
  const u = Math.min(1, Math.max(0, (elapsedMs - BOWL_HOLD_MS) / BOWL_SETTLE_MS));
  const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
  return from * (1 - e);
}
