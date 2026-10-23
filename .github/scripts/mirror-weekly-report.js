// Fetches the GVP/USGS Weekly Volcanic Activity Report RSS through a real browser and writes it,
// re-encoded as UTF-8, to the path given as the first argument. volcano.si.edu answers 403 to
// every non-browser client (curl, Node's fetch, headless Chrome under its own name), so the
// scheduled workflow runs this with the runner's Chrome and a plain browser user agent, once
// every six hours, and commits the document to the `feeds` branch for the server to read when the
// feed itself refuses it (apps/server/src/volcano/client.ts, WEEKLY_REPORT_MIRROR_URL).
import { writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const FEED = "https://volcano.si.edu/news/WeeklyVolcanoRSS.xml";
const AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const out = process.argv[2];
if (out === undefined) {
  console.error("usage: node mirror-weekly-report.js <output file>");
  process.exit(2);
}

const chrome = process.env.CHROME_PATH;
const browser = await puppeteer.launch({
  ...(chrome === undefined ? { channel: "chrome" } : { executablePath: chrome }),
  headless: true,
  args: ["--no-first-run", "--disable-gpu"],
});
try {
  const page = await browser.newPage();
  await page.setUserAgent(AGENT);
  const res = await page.goto(FEED, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (res === null || !res.ok()) {
    throw new Error(`${FEED} answered ${res === null ? "nothing" : String(res.status())}`);
  }
  const bytes = await res.buffer();
  const declared = /encoding="([^"]+)"/i.exec(bytes.subarray(0, 200).toString("latin1"))?.[1];
  const xml = new TextDecoder(declared ?? "utf-8")
    .decode(bytes)
    .replace(/encoding="[^"]+"/i, 'encoding="UTF-8"');
  const items = (xml.match(/<item>/g) ?? []).length;
  if (!xml.includes("<rss") || items === 0) throw new Error("the answer is not the RSS feed");
  writeFileSync(out, xml);
  console.log(`${String(items)} items, ${String(xml.length)} characters -> ${out}`);
} finally {
  await browser.close();
}
