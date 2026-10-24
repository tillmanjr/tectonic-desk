/** A Geosoft GXF grid as the USGS mrdata archive ships it: header keywords, then the numbers. */
export interface GxfGrid {
  /** Columns. */
  points: number;
  rows: number;
  xOrigin: number;
  yOrigin: number;
  ptSeparation: number;
  rwSeparation: number;
  dummy: number;
  /** Row-major in file order (sense 1: from the south-west origin, rows northward); NaN for dummies. */
  values: Float32Array;
}

const NUMBER_KEYS = {
  POINTS: "points",
  ROWS: "rows",
  XORIGIN: "xOrigin",
  YORIGIN: "yOrigin",
  PTSEPARATION: "ptSeparation",
  RWSEPARATION: "rwSeparation",
  DUMMY: "dummy",
} as const;
type NumberKey = keyof typeof NUMBER_KEYS;
const isNumberKey = (k: string): k is NumberKey => Object.hasOwn(NUMBER_KEYS, k);

/**
 * Parses GXF text: each `#KEY` line is followed by its value lines; `#GRID` starts the numbers,
 * which wrap freely across lines and are read by count. Throws when a header is missing or the
 * count is short.
 */
export function parseGxf(text: string): GxfGrid {
  const lines = text.split(/\r?\n/);
  const header: Partial<Record<NumberKey, number>> = {};
  let key: string | null = null;
  let gridAt = -1;
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    if (line.startsWith("#")) {
      key = line.slice(1).trim();
      if (key === "GRID") {
        gridAt = i + 1;
        break;
      }
      continue;
    }
    if (key !== null && isNumberKey(key) && line !== "" && header[key] === undefined) {
      header[key] = Number(line);
    }
  }
  if (gridAt < 0) throw new Error("GXF: no #GRID section");
  const need = (k: NumberKey): number => {
    const v = header[k];
    if (v === undefined || Number.isNaN(v)) throw new Error(`GXF: missing #${k}`);
    return v;
  };
  const points = need("POINTS");
  const rows = need("ROWS");
  const dummy = need("DUMMY");
  const values = new Float32Array(points * rows);
  let n = 0;
  for (let i = gridAt; i < lines.length && n < values.length; i++) {
    for (const tok of lines[i]?.trim().split(/\s+/) ?? []) {
      if (tok === "" || n >= values.length) continue;
      const v = Number(tok);
      values[n++] = v === dummy ? NaN : v;
    }
  }
  if (n < values.length) throw new Error(`GXF: ${String(n)} of ${String(values.length)} values`);
  return {
    points,
    rows,
    xOrigin: need("XORIGIN"),
    yOrigin: need("YORIGIN"),
    ptSeparation: need("PTSEPARATION"),
    rwSeparation: need("RWSEPARATION"),
    dummy,
    values,
  };
}
