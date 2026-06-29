// Download and unpack a Chrome Web Store extension's CRX for reverse-engineering.
// Usage: node fetch-crx.mjs <extensionId> [outDir=reverse/<extId>]
//
// Studying an incumbent to reimplement the same user need is fine; do NOT ship,
// republish, or commit the unpacked code. Keep it in reverse/ and out of any repo.
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const id = process.argv[2];
const outDir = process.argv[3] || `reverse/${id}`;
if (!id || !/^[a-p]{32}$/.test(id)) {
  console.error("Usage: node fetch-crx.mjs <32-char extensionId> [outDir]");
  process.exit(1);
}

const url =
  "https://clients2.google.com/service/update2/crx?response=redirect" +
  "&acceptformat=crx2,crx3&prodversion=124.0" +
  `&x=id%3D${id}%26installsource%3Dondemand%26uc`;

console.log("downloading CRX…");
const UA = "Mozilla/5.0 Chrome/124.0 Safari/537.36";
let buf;
try {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  buf = Buffer.from(await res.arrayBuffer());
} catch (e) {
  // Fall back to curl — more tolerant of restricted/IPv6-flaky networks.
  console.log(`fetch failed (${e.message}); falling back to curl…`);
  const tmp = join(tmpdir(), `crx-${id}.crx`);
  execSync(`curl -sL -A "${UA}" "${url}" -o "${tmp}"`, { stdio: "inherit" });
  buf = await readFile(tmp);
}

// CRX3: "Cr24"(4) | version(4) | headerLen(4 LE) | header | ZIP
if (buf.toString("ascii", 0, 4) !== "Cr24") { console.error("not a CRX file"); process.exit(1); }
const headerLen = buf.readUInt32LE(8);
const zipStart = 12 + headerLen;

await mkdir(outDir, { recursive: true });
const zipPath = `${outDir}.zip`;
await writeFile(zipPath, buf.subarray(zipStart));
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
execSync(`unzip -o -q "${zipPath}" -d "${outDir}"`);

console.log(`\nUnpacked to ${outDir}/`);
console.log("Start by reading the manifest — permissions usually reveal the architecture:");
console.log(`  cat "${outDir}/manifest.json"`);
