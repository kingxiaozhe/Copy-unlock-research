// 按主题统计频次（全样本）+ 低星(<=3)占比，给机会清单可辩护的数字。
import { readdir, readFile } from "node:fs/promises";

const files = (await readdir("data")).filter((f) => f.endsWith(".json"));
let all = [];
for (const f of files) {
  const j = JSON.parse(await readFile(`data/${f}`, "utf8"));
  for (const r of j.reviews) if (r.text) all.push(r);
}

const THEMES = {
  "站点失效/覆盖不全": /\b(doesn.?t work|does not work|not working|no longer work|can.?t copy|cannot copy|can.?t select|useless|nothing|did ?n.?t work|don.?t work)\b/i,
  "广告/木马/隐私不信任": /\b(ad|ads|adware|trojan|virus|spam|tracking|selling|personal info|promo|gcm|banner|blinking|shaking|bouncing)\b/i,
  "破坏页面/干扰正常功能": /\b(break|breaks|broke|broken|disable|disables|enter key|linefeed|form submission|gmail|youtube|captcha|cloudflare|navigation|slider|space|paste.*not|trash|delete)\b/i,
  "激活繁琐/不自动": /\b(every page|every time|rigamarole|cumbersome|just work|should just|activation|click the|turn it on|turn on|orange icon|busy|steps)\b/i,
  "OCR/图片取字": /\b(ocr|image|images|picture|scan|text from)\b/i,
  "快捷键": /\b(shortcut|hotkey|keyboard)\b/i,
  "PDF 选择": /\bpdf\b/i,
  "白名单/记住设置": /\b(whitelist|blacklist|remember|per[- ]?site|per website|preset|save.*state)\b/i,
  "开机/自动启用": /\b(chrome start|browser start|on start|automatically|auto)\b/i,
};

console.log(`全样本含文本评论：${all.length} 条\n`);
const rows = [];
for (const [name, re] of Object.entries(THEMES)) {
  const hits = all.filter((r) => re.test(r.text));
  const low = hits.filter((r) => r.rating && r.rating <= 3).length;
  rows.push({ name, total: hits.length, low });
}
rows.sort((a, b) => b.total - a.total);
for (const r of rows) {
  console.log(`${r.name.padEnd(16)}  命中 ${String(r.total).padStart(3)}  其中 ≤3★ ${String(r.low).padStart(3)}`);
}
