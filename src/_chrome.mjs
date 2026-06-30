// Locate a Chrome binary to drive with puppeteer-core.
// Override with CHROME_PATH. For SCRAPING/screenshots, system Chrome is fine.
// For LOADING UNPACKED EXTENSIONS, you must use Chrome for Testing (branded
// Chrome 137+ ignores --load-extension) — set CHROME_PATH to that binary.
import { existsSync } from "node:fs";

const CANDIDATES = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ],
};

export function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const p of CANDIDATES[process.platform] || []) if (existsSync(p)) return p;
  throw new Error(
    "Chrome not found. Set CHROME_PATH to a Chrome binary.\n" +
      "For loading unpacked extensions, install Chrome for Testing:\n" +
      "  npx @puppeteer/browsers install chrome@stable"
  );
}
