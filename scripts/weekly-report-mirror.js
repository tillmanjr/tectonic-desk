// Refreshes the `feeds` branch copy of the GVP/USGS Weekly Volcanic Activity Report RSS.
//
// volcano.si.edu answers 403 to every non-browser client (curl, Node's fetch, headless Chrome
// under its own name) and to browsers on datacenter addresses (a GitHub-hosted runner's Chrome
// was refused on 2026-10-23), so this runs from an ordinary machine: it fetches the feed through
// the local Chrome with a plain browser user agent, re-encodes it as UTF-8 and, when it changed,
// commits it to `feeds` and pushes. The server asks the feed first and reads that copy only when
// the feed refuses (apps/server/src/volcano/client.ts, WEEKLY_REPORT_MIRROR_URL). The report is
// published by 2300 UTC on Thursdays, so a run every few hours, or once on Fridays, keeps up.
//
// Usage: pnpm feeds:mirror [--no-push]   (CHROME_PATH names a Chrome when the default is not found)
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const FEED = "https://volcano.si.edu/news/WeeklyVolcanoRSS.xml";
const AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const BRANCH = "feeds";
const FILE = "WeeklyVolcanoRSS.xml";
const push = !process.argv.includes("--no-push");

/** The feed as a UTF-8 string, fetched through Chrome. */
async function fetchFeed() {
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
    if (!xml.includes("<rss") || !xml.includes("<item>")) {
      throw new Error("the answer is not the RSS feed");
    }
    return xml;
  } finally {
    await browser.close();
  }
}

/** Runs git with the given arguments, returning its output; throws on a non-zero exit. */
const git = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();

const xml = await fetchFeed();
const items = (xml.match(/<item>/g) ?? []).length;
const published = /<pubDate>([^<]+)<\/pubDate>/.exec(xml)?.[1];
const stamp = new Date(published ?? Date.now()).toISOString().slice(0, 10);
console.log(`${String(items)} items, report of ${stamp}`);

const root = git(["rev-parse", "--show-toplevel"]);
git(["fetch", "--quiet", "origin", BRANCH], root);
const dir = mkdtempSync(join(tmpdir(), "tectonic-feeds-"));
try {
  git(["worktree", "add", "--quiet", "--detach", dir, `origin/${BRANCH}`], root);
  writeFileSync(join(dir, FILE), xml);
  git(["add", FILE], dir);
  let changed = true;
  try {
    git(["diff", "--cached", "--quiet"], dir);
    changed = false;
  } catch {
    changed = true;
  }
  if (!changed) {
    console.log("the mirror already has this document");
  } else {
    git(["commit", "--quiet", "-m", `Weekly report feed as of ${stamp}`], dir);
    if (push) {
      git(["push", "--quiet", "origin", `HEAD:${BRANCH}`], dir);
      console.log(`pushed to ${BRANCH}`);
    } else {
      console.log("committed in the temporary worktree only (--no-push), discarding");
    }
  }
} finally {
  git(["worktree", "remove", "--force", dir], root);
}
