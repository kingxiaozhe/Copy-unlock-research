/*
 * OCR 可行性 spike：验证「纯设备端 OCR 在中文图片文字上的准确率」这一最高风险假设。
 *
 * 做法：用 Playwright 把【已知】中文文本渲染成图片（文库/豆丁正是把数字文字渲染成图，
 * 故这是忠实代理，且有精确 ground truth），再用 Tesseract.js（纯 WASM，设备端，不联网*）
 * 识别，算字符错误率 CER。
 *   *spike 阶段首次会从 CDN 下载 chi_sim 语言包；生产要守「零联网」需把语言包打进扩展（约 ~15MB，见结论）。
 *
 * 量化信号：CER（越低越好）、识别耗时。两档画质：清晰(最好情况) + 压缩缩小(模拟文库)。
 */
import { createRequire } from "module";
import { writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const { createWorker } = require("tesseract.js");

// 代表性中文样本（含常用字、标点、数字）——这是 ground truth
const TRUTH =
  "人工智能正在深刻改变我们的生活方式。从智能手机到自动驾驶汽车，" +
  "机器学习算法已经渗透到各个领域。研究表明，到2030年，" +
  "全球将有超过八亿个工作岗位受到自动化技术的影响。" +
  "因此，持续学习与技能升级显得尤为重要。";

const SAMPLES = [
  { id: "对照-清晰(22px)", font: 22, type: "png", quality: 0, color: "#111", bg: "#fff" },
  { id: "小字(12px)", font: 12, type: "png", quality: 0, color: "#111", bg: "#fff" },
  { id: "极小字(10px)", font: 10, type: "png", quality: 0, color: "#111", bg: "#fff" },
  { id: "低对比灰字(16px)", font: 16, type: "png", quality: 0, color: "#999", bg: "#eee" },
  { id: "小字重压缩(13px,JPEGq25)", font: 13, type: "jpeg", quality: 25, color: "#111", bg: "#fff" },
];

const strip = (s) => (s || "").replace(/\s/g, "");

// 编辑距离（Levenshtein）
function lev(a, b) {
  const m = a.length,
    n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

// 1) 渲染样本图片
const browser = await chromium.launchPersistentContext("", {
  headless: true,
  args: ["--no-first-run"],
  ignoreDefaultArgs: ["--enable-automation"],
});
const page = await browser.newPage();
const files = [];
for (const s of SAMPLES) {
  await page.setContent(
    `<div id="t" style="width:680px;padding:24px;background:${s.bg};color:${s.color};
      font-family:'PingFang SC','Microsoft YaHei',sans-serif;
      font-size:${s.font}px;line-height:1.9;letter-spacing:.5px;">${TRUTH}</div>`,
    { waitUntil: "load" }
  );
  const el = await page.$("#t");
  const path = `/tmp/ocr_${s.font}.${s.type}`;
  await el.screenshot(
    s.type === "jpeg" ? { path, type: "jpeg", quality: s.quality } : { path }
  );
  files.push({ ...s, path });
}
await browser.close();
console.log(`真值字符数（去空白）：${strip(TRUTH).length}\n`);

// 2) OCR
const worker = await createWorker("chi_sim");
const rows = [];
for (const f of files) {
  const t0 = Date.now();
  const {
    data: { text },
  } = await worker.recognize(f.path);
  const ms = Date.now() - t0;
  const out = strip(text);
  const truth = strip(TRUTH);
  const dist = lev(out, truth);
  const cer = dist / truth.length;
  rows.push({ id: f.id, cer, acc: 1 - cer, ms, outLen: out.length, head: out.slice(0, 30) });
}
await worker.terminate();

// 3) 报告
console.log("=== OCR 结果（设备端 Tesseract.js chi_sim）===\n");
for (const r of rows) {
  console.log(
    `${r.id}\n  字符准确率 ${(r.acc * 100).toFixed(1)}%  (CER ${(r.cer * 100).toFixed(1)}%)  耗时 ${r.ms}ms  识别出 ${r.outLen} 字\n  识别头部: ${r.head}…\n`
  );
}
await writeFile(
  "data/OCR-SPIKE.json",
  JSON.stringify({ truthLen: strip(TRUTH).length, rows }, null, 2)
);
console.log("结果已存 data/OCR-SPIKE.json");
