/**
 * Builds `data/relief/earth_relief_03m.i16`, the raw grid of metres the relief route samples,
 * from GMT's `earth_relief_03m_p` tiles (SRTM15+ v2.7, Tozer et al. 2019): eight 90° JPEG 2000
 * tiles, downloaded into `.cache/relief/` once and decoded with the OpenJPEG wasm codec.
 * The server image runs this in its build stage; the output is gitignored.
 *
 * Usage: `pnpm --filter @tectonic/server geo:relief`
 */
import openjpegFactory from "@cornerstonejs/codec-openjpeg/decodewasmjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchTileBytes } from "./geo/relief-fetch.js";
import {
  DEFAULT_RELIEF_FILE,
  jp2Codestream,
  placeTile,
  RELIEF,
  RELIEF_SOURCE,
  RELIEF_TILES,
} from "./geo/relief.js";

const BASE =
  "https://oceania.generic-mapping-tools.org/server/earth/earth_relief/earth_relief_03m_p";
const CACHE = fileURLToPath(new URL("../.cache/relief/", import.meta.url));

async function fetchTile(name: string): Promise<Buffer> {
  const path = join(CACHE, `${name}.jp2`);
  if (existsSync(path)) return readFileSync(path);
  const url = `${BASE}/${name}.earth_relief_03m_p.jp2`;
  console.log(`fetching ${url}`);
  const buf = await fetchTileBytes(url, {
    log: {
      warn: (obj, msg) => {
        console.warn(msg, obj);
      },
    },
  });
  writeFileSync(path, buf);
  return buf;
}

async function main(): Promise<void> {
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(dirname(DEFAULT_RELIEF_FILE), { recursive: true });
  const openjpeg = await openjpegFactory();
  const grid = new Int16Array(RELIEF.width * RELIEF.height);
  for (const tile of RELIEF_TILES) {
    const file = await fetchTile(tile.name);
    const codestream = jp2Codestream(new Uint8Array(file.buffer, file.byteOffset, file.byteLength));
    const decoder = new openjpeg.J2KDecoder();
    const encoded = decoder.getEncodedBuffer(codestream.length);
    encoded.set(codestream);
    decoder.decode();
    const info = decoder.getFrameInfo();
    if (info.width !== RELIEF.tileSize || info.height !== RELIEF.tileSize || !info.isSigned) {
      throw new Error(`${tile.name}: unexpected frame ${JSON.stringify(info)}`);
    }
    const out = decoder.getDecodedBuffer();
    const samples = new Int16Array(out.buffer, out.byteOffset, out.byteLength / 2);
    placeTile(grid, samples, tile.lon, tile.lat);
    decoder.delete();
    console.log(`${tile.name} decoded`);
  }
  writeFileSync(DEFAULT_RELIEF_FILE, Buffer.from(grid.buffer));
  writeFileSync(
    DEFAULT_RELIEF_FILE.replace(/\.i16$/, ".json"),
    JSON.stringify(
      { source: RELIEF_SOURCE, grid: RELIEF, generated: new Date().toISOString() },
      null,
      2,
    ) + "\n",
  );
  console.log(`wrote ${DEFAULT_RELIEF_FILE} (${String(grid.byteLength)} bytes)`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
