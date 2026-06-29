// Scrape a Chrome Web Store listing's metadata + reviews.
// Usage: node scrape-reviews.mjs "<store detail or /reviews URL>" [maxLoadMore=40]
// Output: ./data/<extId>.json  ({ meta, reviews:[{author,date,rating,text,helpful}] })
//
// Resilience note: the Web Store's review DOM uses obfuscated, churning class
// names. The author/date/body selectors below may drift over time, but the
// container-finding logic does NOT hardcode the wrapper class — it climbs from
// each author element to the LARGEST ancestor that still contains exactly one
// author, which reliably bounds one full review without bleeding into the next.
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";
import { findChrome } from "./_chrome.mjs";

const url = process.argv[2];
const MAX_LOAD_MORE = Number(process.argv[3] ?? 40);
if (!url) { console.error("Usage: node scrape-reviews.mjs <url> [maxLoadMore]"); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const idMatch = url.match(/detail\/[^/]*\/([a-p]{32})/);
const slug = idMatch ? idMatch[1] : url.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: false,
  defaultViewport: { width: 1280, height: 1600 },
  args: ["--no-first-run", "--no-default-browser-check"],
});
const page = await browser.newPage();
await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
await sleep(2500);

let clicks = 0;
while (clicks < MAX_LOAD_MORE) {
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => /load more|show more|more reviews/i.test(b.innerText || ""));
    if (btn) { btn.scrollIntoView({ block: "center" }); btn.click(); return true; }
    return false;
  });
  if (!clicked) break;
  clicks++;
  await sleep(1100);
}

const result = await page.evaluate(() => {
  const txt = (el) => (el ? el.innerText.trim() : null);
  const body = document.body.innerText;
  const m = (re) => (body.match(re) || [])[1];
  const meta = {
    name: txt(document.querySelector("h1")),
    avgRating: m(/([\d.]+)\s+out of 5/i),
    ratingsCount: (m(/([\d,.]+\s*[KM]?)\s+ratings/i) || "").trim(),
    usersCount: (m(/([\d,.]+\s*[KM]?)\s+users/i) || "").trim(),
  };

  const authors = [...document.querySelectorAll("h3 span.LfYwpe, span.LfYwpe")];
  const seen = new Set();
  const reviews = [];
  for (const a of authors) {
    // Climb to the largest ancestor that still contains exactly one author.
    let container = a, node = a;
    for (let i = 0; i < 12; i++) {
      node = node.parentElement;
      if (!node) break;
      if (node.querySelectorAll("span.LfYwpe").length === 1) container = node; else break;
    }
    if (!container || seen.has(container)) continue;
    seen.add(container);
    const ratingEl = container.querySelector('[role="img"][aria-label*="out of"]');
    const rating = ratingEl ? Number((ratingEl.getAttribute("aria-label").match(/^(\d)/) || [])[1]) : null;
    const bodyEl = container.querySelector("p.fzDEpf, p[jsname]");
    const helpful = (container.innerText.match(/(\d+)\s+(?:person|people)\s+found this review/i) || [])[1];
    reviews.push({
      author: a.innerText.trim(),
      date: txt(container.querySelector("span.ydlbEf")),
      rating,
      text: bodyEl ? bodyEl.innerText.trim() : "",
      helpful: helpful ? Number(helpful) : 0,
    });
  }
  return { meta, reviews };
});

result.meta.url = url;
result.meta.reviewCount = result.reviews.length;
await mkdir("data", { recursive: true });
await writeFile(`data/${slug}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result.meta, null, 2));
console.log(`\nScraped ${result.reviews.length} reviews (${clicks} load-more clicks) -> data/${slug}.json`);
if (result.reviews.length && result.reviews.every((r) => !r.text)) {
  console.warn("\nWARNING: all review bodies empty — the body selector (p.fzDEpf) likely changed. Inspect the page DOM and update it.");
}
await browser.close();
