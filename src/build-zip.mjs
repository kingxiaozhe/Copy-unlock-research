// Build a Chrome Web Store upload zip from an unpacked extension directory.
// Usage: node build-zip.mjs <extDir> [outZip=<extDir>/../<name>-upload.zip]
//
// Strips the manifest "key" field — the Web Store rejects packages that contain
// it ("清单文件中不得包含 'key' 字段"), but you keep it in your working copy so the
// locally-loaded extension keeps a stable ID for testing.
// Ships only runtime files: excludes README/docs/store-assets/*.pem/.git etc.
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, basename, resolve } from "node:path";

const extDir = process.argv[2];
if (!extDir || !existsSync(join(extDir, "manifest.json"))) {
  console.error("Usage: node build-zip.mjs <extDir>   (extDir must contain manifest.json)");
  process.exit(1);
}
const name = basename(resolve(extDir));
const out = process.argv[3] || resolve(extDir, "..", `${name}-upload.zip`);

// Only ship runtime files. Skip dev/repo/asset clutter.
// Deny-list of non-runtime files/dirs (design mockups, docs, store art, tests, repo cruft).
const SKIP = new Set(["README.md", "STORE_LISTING.md", "docs", "store-assets", "design", "test", "tests", "__tests__", ".git", ".gitignore", ".DS_Store", "node_modules"]);
const entries = readdirSync(extDir).filter(
  (e) => !SKIP.has(e) && !e.endsWith(".pem") && e !== "manifest.json"
);

const build = mkdtempSync(join(tmpdir(), "crx-build-"));
const m = JSON.parse(readFileSync(join(extDir, "manifest.json"), "utf8"));
delete m.key;
writeFileSync(join(build, "manifest.json"), JSON.stringify(m, null, 2));
for (const e of entries) cpSync(join(extDir, e), join(build, e), { recursive: true });

rmSync(out, { force: true });
execSync(`cd "${build}" && zip -r -q "${out}" manifest.json ${entries.map((e) => `"${e}"`).join(" ")}`);
rmSync(build, { recursive: true, force: true });

const keyCount = execSync(`unzip -p "${out}" manifest.json | grep -c '"key"' || true`).toString().trim();
console.log(`Built ${out}`);
console.log(`manifest "key" in zip: ${keyCount} (must be 0)`);
console.log(execSync(`unzip -l "${out}"`).toString());
