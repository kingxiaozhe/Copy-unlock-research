/*
 * 真实站点探测：对比「无扩展 vs 加载扩展」对禁复制页面的效果。
 * 信号：
 *   - userSelect：内容元素的 computed user-select（none = 用户无法选中）
 *   - copyPrevented/selectstartPrevented/contextmenuPrevented：合成事件是否被页面取消
 *   - clipboard：程序化选中正文 → execCommand('copy') → 读真实剪贴板，
 *     与选中原文对比：干净=放行；含水印/变长=被篡改；空/哨兵=被阻止
 *
 * 用法：node src/site-probe.mjs   （URL 列表见下方 URLS）
 * 仅测公开可见、纯前端禁复制的页面；不碰登录墙/付费墙。
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

const EXT = "/Users/wanghao/MyCode/copy-unlock";
const URLS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "https://blog.csdn.net/superit401/article/details/80340075",
      "https://zhuanlan.zhihu.com/p/74923901",
      "https://www.cnblogs.com/liyuanhong/articles/17439119.html",
      "https://jingyan.baidu.com/article/d45ad14841799869552b80f4.html",
    ];

const SENTINEL = "__CU_SENTINEL__";

function launch(withExt) {
  const args = ["--no-first-run", "--no-default-browser-check"];
  if (withExt) {
    args.push(
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      "--disable-features=DisableLoadExtensionCommandLineSwitch"
    );
  }
  return chromium.launchPersistentContext("", {
    headless: false,
    args,
    ignoreDefaultArgs: ["--disable-extensions", "--enable-automation"],
    viewport: { width: 1100, height: 800 },
  });
}

async function measure(ctx, url) {
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch (e) {
    await page.close();
    return { error: "goto: " + (e.message || e).slice(0, 80) };
  }
  await page.waitForTimeout(3000); // 让站点脚本与扩展都就位
  try {
    await page.bringToFront();
  } catch (_) {}

  // 设哨兵，便于判断 copy 是否真的写入了剪贴板
  try {
    await page.evaluate((s) => navigator.clipboard.writeText(s).catch(() => {}), SENTINEL);
  } catch (_) {}

  // 选内容元素、滚动到中部、收集启发式，返回其视口矩形供真实拖拽
  const info = await page.evaluate(() => {
    function pickEl() {
      let best = null,
        len = 0;
      for (const p of document.querySelectorAll("p, article, .content, li")) {
        const t = (p.innerText || "").trim().length;
        if (t > len && t < 20000) {
          len = t;
          best = p;
        }
      }
      return best || document.body;
    }
    const el = pickEl();
    el.scrollIntoView({ block: "center" });
    const cs = getComputedStyle(el);
    const us = cs.userSelect || cs.webkitUserSelect || "";
    // 文字疑似图片：正文文本极少但大图很多
    const bodyTextLen = (document.body.innerText || "").trim().length;
    let bigImgs = 0;
    for (const im of document.images)
      if (im.width > 200 && im.height > 150) bigImgs++;
    const rect = el.getBoundingClientRect();
    window.__cuEl = el; // 供后续 evaluate 复用
    return {
      us,
      bodyTextLen,
      bigImgs,
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    };
  });

  // 合成事件 + 程序化选区复制（检测篡改/阻止）
  const r = await page.evaluate(() => {
    const el = window.__cuEl || document.body;
    const fire = (t) => {
      const e = new Event(t, { bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    };
    const copyPrev = fire("copy");
    const selPrev = fire("selectstart");
    const ctxPrev = fire("contextmenu");
    let selText = "";
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      selText = (sel.toString() || "").trim();
      document.execCommand("copy");
    } catch (_) {}
    return { copyPrev, selPrev, ctxPrev, selLen: selText.length, selHead: selText.slice(0, 40) };
  });
  r.us = info.us;
  r.bodyTextLen = info.bodyTextLen;

  // 真实鼠标拖拽选区：在正文「首个文本行」上水平拖（即时取文字所在的精确矩形，
  // 避免拖到 padding/陈旧坐标——这是上一版全为 0 的假阴性根源）
  let dragLen = 0;
  try {
    await page.evaluate(() => window.getSelection().removeAllRanges());
    const tr = await page.evaluate(() => {
      const el = window.__cuEl;
      if (!el) return null;
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        const t = (n.textContent || "").trim();
        if (t.length > 20) {
          const rng = document.createRange();
          rng.setStart(n, 0);
          rng.setEnd(n, Math.min(40, n.textContent.length));
          const r = rng.getBoundingClientRect();
          if (r.width > 10 && r.top > 60 && r.bottom < innerHeight - 20)
            return { x: r.x, y: r.y + r.height / 2, w: r.width };
        }
      }
      return null;
    });
    if (tr) {
      await page.mouse.move(tr.x + 2, tr.y);
      await page.mouse.down();
      await page.mouse.move(tr.x + Math.min(tr.w, 300), tr.y, { steps: 15 });
      await page.mouse.up();
      dragLen = await page.evaluate(() => (window.getSelection().toString() || "").trim().length);
    } else {
      dragLen = -1; // 找不到可拖的文本节点（疑似文字渲染为图片）
    }
  } catch (_) {}
  r.dragLen = dragLen;
  r.imgSuspect = dragLen === -1 && info.bigImgs >= 2;

  let clip = "";
  try {
    clip = await page.evaluate(async () => {
      try {
        return await navigator.clipboard.readText();
      } catch (e) {
        return "ERR:" + e.message;
      }
    });
  } catch (_) {}
  await page.close();

  // 判定剪贴板
  const WATERMARK = /(著作权|版权所有|本文(链接|来源)|转载请|原文链接|copyright|来源[:：]|all rights reserved)/i;
  let copyState;
  if (clip === SENTINEL || clip === "") copyState = "阻止(未写入)";
  else if (clip.startsWith("ERR:")) copyState = "读取失败";
  else {
    const cleanLen = clip.replace(/\s/g, "").length;
    const selClean = r.selHead.replace(/\s/g, "");
    const contains = selClean && clip.replace(/\s/g, "").includes(selClean);
    if (!contains) copyState = "不匹配(可能篡改/空)";
    else if (WATERMARK.test(clip) || cleanLen > r.selLen * 1.15)
      copyState = "篡改(含水印/额外)";
    else copyState = "干净";
  }

  return { ...r, clipLen: clip.length, clipTail: clip.slice(-60), copyState };
}

(async () => {
  console.log("=== 基线（无扩展）===");
  const off = await launch(false);
  await off.grantPermissions(["clipboard-read", "clipboard-write"]);
  const baseline = {};
  for (const u of URLS) {
    baseline[u] = await measure(off, u);
    console.log(`\n${u}\n  ${JSON.stringify(baseline[u])}`);
  }
  await off.close();

  console.log("\n\n=== 加载扩展（标准模式）===");
  const on = await launch(true);
  await on.grantPermissions(["clipboard-read", "clipboard-write"]);
  const withExt = {};
  for (const u of URLS) {
    withExt[u] = await measure(on, u);
    console.log(`\n${u}\n  ${JSON.stringify(withExt[u])}`);
  }
  await on.close();

  console.log("\n\n=== 对比小结 ===");
  for (const u of URLS) {
    const b = baseline[u],
      w = withExt[u];
    if (b.error || w.error) {
      console.log(`\n${u}\n  ⚠️ ${b.error || ""} ${w.error || ""}`);
      continue;
    }
    const fixedCopy = b.copyState !== "干净" && w.copyState === "干净";
    const noText = w.dragLen === -1; // 正文无可选文本节点 → 渲染成图片
    const dragConfirmed = w.dragLen > 0; // 真实拖拽确实选到了字
    let verdict;
    if (noText)
      verdict = "🖼️ 正文无可选文本（疑似图片/canvas 渲染）→ 标准模式无能为力，需 OCR";
    else if (fixedCopy) verdict = "✅ 标准模式修复（剪贴板已证实）";
    else if (w.copyState === "干净" && b.copyState === "干净") verdict = "— 本就可复制";
    else verdict = "⚠️ 不确定（看剪贴板/拖拽明细）";
    // 拖拽=0 视为「harness 未测准」而非「被锁」（剪贴板信号才权威）
    const dragNote = w.dragLen === 0 ? "(harness 未取到，看剪贴板)" : w.dragLen === -1 ? "无文本" : String(w.dragLen);
    console.log(
      `\n${u}` +
        `\n  真实拖拽选中字数: ${dragNote}  |  正文文本量(含导航): ${w.bodyTextLen}` +
        `\n  复制(剪贴板): ${b.copyState} → ${w.copyState}` +
        `\n  判定: ${verdict}`
    );
  }
})();
