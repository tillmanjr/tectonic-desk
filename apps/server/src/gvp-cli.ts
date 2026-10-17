/**
 * Regenerates `data/geo/volcanoes.json` and `data/geo/eruptions.json` from the
 * Smithsonian Global Volcanism Program WFS. Usage:
 * `pnpm --filter @tectonic/server geo:volcanoes`
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_GEO_DIR } from "./geo/assets.js";
import { buildGvpFiles, type WfsCollection } from "./geo/gvp.js";

const WFS = "https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows";
const LAYERS = {
  volcanoes: "GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes",
  eruptions: "GVP-VOTW:Smithsonian_VOTW_Holocene_Eruptions",
  e3: "GVP-VOTW:E3WebApp_Eruptions1960",
} as const;

async function fetchLayer(typeName: string): Promise<WfsCollection> {
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    outputFormat: "application/json",
    typeName,
  });
  const res = await fetch(`${WFS}?${params.toString()}`, {
    headers: { "user-agent": "tectonic-desk/0.0 (+https://tectonicdesk.org)" },
  });
  if (!res.ok) throw new Error(`GVP WFS answered ${String(res.status)} for ${typeName}`);
  const body = (await res.json()) as WfsCollection;
  process.stderr.write(`${typeName}: ${String(body.features.length)} features\n`);
  return body;
}

async function main(): Promise<void> {
  const [volcanoes, eruptions, e3] = await Promise.all([
    fetchLayer(LAYERS.volcanoes),
    fetchLayer(LAYERS.eruptions),
    fetchLayer(LAYERS.e3),
  ]);
  const files = buildGvpFiles(volcanoes, eruptions, e3, new Date());
  for (const [name, file] of Object.entries(files)) {
    const path = join(DEFAULT_GEO_DIR, `${name}.json`);
    const body = JSON.stringify(file);
    writeFileSync(path, `${body}\n`);
    console.log(
      `${name}: ${String(file.meta.count)} items, ${String(Math.round(body.length / 1024))} KB -> ${path}`,
    );
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
