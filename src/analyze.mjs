// 读取 data/*.json，输出评分分布 + 过滤出有信号的评论（抱怨/需求/bug），供聚类。
import { readdir, readFile } from "node:fs/promises";

const SIGNAL =
  /\b(wish|would be|hope|please|should|could you|add|feature|option|support|doesn|can.?t|cannot|won.?t|stopped|broke|broken|bug|glitch|issue|problem|crash|lag|distort|not work|no longer|update|missing|need|annoying|ads?|popup|permission|reset|save|remember|preset|hotkey|shortcut|image|pdf|select|menu|paste)\b/i;

const files = (await readdir("data")).filter((f) => f.endsWith(".json"));
let all = [];
const dist = {};

for (const f of files) {
  const j = JSON.parse(await readFile(`data/${f}`, "utf8"));
  const name = j.meta.name || f;
  const d = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, none: 0, total: j.reviews.length };
  for (const r of j.reviews) d[r.rating || "none"]++;
  dist[name] = { ...d, users: j.meta.usersCount, ratings: j.meta.ratingsCount, file: f };
  for (const r of j.reviews) all.push({ ...r, ext: name });
}

console.log("=== 评分分布 ===");
for (const [name, d] of Object.entries(dist)) {
  console.log(
    `\n${name}  [${d.users} users, ${d.ratings} ratings]  样本 ${d.total}`
  );
  console.log(
    `  1★:${d[1]}  2★:${d[2]}  3★:${d[3]}  4★:${d[4]}  5★:${d[5]}  无评分:${d.none}`
  );
}

// 有信号评论：有文本，且（命中关键词 或 评分<=3）
const signal = all.filter(
  (r) => r.text && r.text.length > 8 && (SIGNAL.test(r.text) || (r.rating && r.rating <= 3))
);
// 排序：评分升序、helpful 降序
signal.sort((a, b) => (a.rating || 9) - (b.rating || 9) || (b.helpful || 0) - (a.helpful || 0));

console.log(`\n\n=== 有信号评论 ${signal.length} 条（共 ${all.length}）===`);
for (const r of signal) {
  const t = r.text.replace(/\s+/g, " ").trim();
  console.log(`\n[${r.rating ?? "?"}★ 👍${r.helpful} | ${r.ext.slice(0, 24)}] ${t}`);
}
