// Generate extension icon sizes (16/32/48/128) from a square source image.
// Usage: node gen-icons.mjs <source.png> <outDir>
// Source should be square (e.g. 1024x1024). Uses Chrome to rasterize so it works
// without ImageMagick; on macOS `sips` is used if available for crisp downscales.
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, extname } from "node:path";
// puppeteer-core and _chrome are imported lazily below, only if the sips fast
// path is unavailable — so this works dependency-free on macOS.

const src = process.argv[2];
const outDir = process.argv[3];
if (!src || !outDir || !existsSync(src)) {
  console.error("Usage: node gen-icons.mjs <source.png> <outDir>");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const SIZES = [128, 48, 32, 16];

// Fast path: macOS sips.
let usedSips = false;
try {
  execSync("command -v sips", { stdio: "ignore" });
  for (const s of SIZES) execSync(`sips -z ${s} ${s} "${src}" --out "${join(outDir, `icon-${s}.png`)}"`, { stdio: "ignore" });
  usedSips = true;
} catch {}

if (!usedSips) {
  const { default: puppeteer } = await import("puppeteer-core");
  const { findChrome } = await import("./_chrome.mjs");
  const b64 = readFileSync(src).toString("base64");
  const mime = extname(src).toLowerCase() === ".jpg" ? "image/jpeg" : "image/png";
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: "new" });
  const page = await browser.newPage();
  for (const s of SIZES) {
    await page.setViewport({ width: s, height: s, deviceScaleFactor: 1 });
    await page.setContent(`<body style="margin:0"><img src="data:${mime};base64,${b64}" style="width:${s}px;height:${s}px;display:block"></body>`, { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 120));
    await page.screenshot({ path: join(outDir, `icon-${s}.png`), clip: { x: 0, y: 0, width: s, height: s } });
  }
  await browser.close();
}

for (const s of SIZES) console.log(`wrote ${join(outDir, `icon-${s}.png`)}`);
console.log('\nAdd to manifest.json "icons" and action.default_icon: { "16": "icons/icon-16.png", ... }');
