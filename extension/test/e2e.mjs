/*
 * 端到端测试：用真实 Chrome 加载未打包扩展，验证 chrome.* 运行时部分。
 * 运行：NODE_PATH=<npx缓存>/node_modules node test/e2e.mjs
 */
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(__dirname, "..");
const TEST_URL = "http://localhost:8731/test/blocked-page.html";

const log = (...a) => console.log(...a);
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  log(`${pass ? "✅" : "❌"} ${name}${detail ? "  — " + detail : ""}`);
};

// 用 Playwright 自带 Chromium（系统 Chrome 149 已禁用命令行 --load-extension）
const ctx = await chromium.launchPersistentContext("", {
  headless: false, // 扩展无法在旧版 headless 下加载，需有头模式
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    "--disable-features=DisableLoadExtensionCommandLineSwitch",
    "--no-first-run",
    "--no-default-browser-check",
  ],
  ignoreDefaultArgs: ["--disable-extensions", "--enable-automation"],
});

try {
  // 1) service worker（背景脚本）是否起来
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 10000 });
  const extId = sw.url().split("/")[2];
  check("background service worker 启动", !!extId, `extId=${extId}`);

  // 2) 默认配置写入（onInstalled 异步写入，轮询等待至多 ~2s）
  let cfg = {};
  for (let i = 0; i < 20; i++) {
    cfg = await sw.evaluate(
      () =>
        new Promise((r) =>
          chrome.storage.local.get(["enabled", "disabledSites", "strongSites"], r)
        )
    );
    if (cfg.enabled === true && Array.isArray(cfg.disabledSites)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  check(
    "默认配置初始化",
    cfg.enabled === true &&
      Array.isArray(cfg.disabledSites) &&
      Array.isArray(cfg.strongSites),
    JSON.stringify(cfg)
  );

  // 3) 打开禁复制测试页，content script 是否解锁
  const page = await ctx.newPage();
  await page.goto(TEST_URL, { waitUntil: "load" });
  await page.waitForTimeout(500);

  const unlock = await page.evaluate(() => {
    const box = document.querySelector(".protected");
    const us = getComputedStyle(box).userSelect || getComputedStyle(box).webkitUserSelect;
    const fire = (t) => {
      const e = new Event(t, { bubbles: true, cancelable: true });
      box.dispatchEvent(e);
      return e.defaultPrevented;
    };
    return { us, copy: fire("copy"), ctx: fire("contextmenu"), sel: fire("selectstart") };
  });
  check(
    "标准模式解锁（content script 真实注入）",
    unlock.us === "text" && !unlock.copy && !unlock.ctx && !unlock.sel,
    JSON.stringify(unlock)
  );

  // 4) 徽章：active 时应显示 ON 或计数
  await page.waitForTimeout(800);
  const badge = await sw.evaluate(
    (tid) => chrome.action.getBadgeText({ tabId: tid }),
    await page.evaluate(() => 0).then(async () => {
      // 取当前 tab id：通过 sw 查询
      return undefined;
    })
  ).catch(() => null);
  // 用 sw 查 tabs 拿 id 再取 badge
  const badgeText = await sw.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    const t = tabs.find((x) => x.url && x.url.includes("blocked-page.html"));
    if (!t) return "NO_TAB";
    return await chrome.action.getBadgeText({ tabId: t.id });
  }, TEST_URL);
  check("图标徽章反映状态", badgeText === "ON" || /^\d+\+?$/.test(badgeText), `badge="${badgeText}"`);

  // 5) 关闭本站：写 disabledSites 后发消息，应恢复被拦截
  const hostname = new URL(TEST_URL).hostname;
  await page.evaluate(
    (h) =>
      new Promise((r) =>
        chrome.storage?.local
          ? r()
          : r()
      ),
    hostname
  );
  // 通过 sw 设置 disabledSites 并向 content 发消息
  await sw.evaluate(
    (h) =>
      new Promise((r) =>
        chrome.storage.local.set({ disabledSites: [h] }, r)
      ),
    hostname
  );
  const setRes = await sw.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    const t = tabs.find((x) => x.url && x.url.includes("blocked-page.html"));
    return await chrome.tabs.sendMessage(t.id, { type: "CU_SET_ACTIVE", active: false });
  }, TEST_URL);
  await page.waitForTimeout(200);
  const afterDisable = await page.evaluate(() => {
    const box = document.querySelector(".protected");
    const e = new Event("copy", { bubbles: true, cancelable: true });
    box.dispatchEvent(e);
    return e.defaultPrevented; // 关闭后页面应重新拦截 → true
  });
  check("本站关闭即时生效（恢复拦截）", setRes && setRes.ok && afterDisable === true, `resp=${JSON.stringify(setRes)}, copyPrevented=${afterDisable}`);

  // 重新开启
  await sw.evaluate(
    () => new Promise((r) => chrome.storage.local.set({ disabledSites: [] }, r))
  );

  // 6) 强力持久化：写 strongSites → background 应动态注册 MAIN 世界脚本
  await sw.evaluate(
    (h) => new Promise((r) => chrome.storage.local.set({ strongSites: [h] }, r)),
    hostname
  );
  await page.waitForTimeout(600);
  const registered = await sw.evaluate(async () => {
    const list = await chrome.scripting.getRegisteredContentScripts();
    return list.map((s) => ({ id: s.id, world: s.world, runAt: s.runAt, matches: s.matches }));
  });
  const strongReg = registered.find((s) => s.id.startsWith("strong_"));
  check(
    "强力模式动态注册成功（id 不含非法字符）",
    !!strongReg && strongReg.world === "MAIN" && strongReg.runAt === "document_start",
    JSON.stringify(strongReg)
  );

  // 7) 强力注册后重新加载页面，closed Shadow DOM 应被穿透
  const page2 = await ctx.newPage();
  // 改造测试：动态建一个 closed shadow 看是否被 force-open
  await page2.goto(TEST_URL, { waitUntil: "load" });
  await page2.waitForTimeout(700);
  const closedOpened = await page2.evaluate(() => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const r = host.attachShadow({ mode: "closed" });
    r.innerHTML = '<div style="user-select:none">x</div>';
    // 若被 force-open，host.shadowRoot 不再为 null
    return { shadowRootAccessible: host.shadowRoot !== null };
  });
  check(
    "强力模式 force-open closed Shadow DOM",
    closedOpened.shadowRootAccessible === true,
    JSON.stringify(closedOpened)
  );

  // 8) 取消强力 → 应注销
  await sw.evaluate(
    () => new Promise((r) => chrome.storage.local.set({ strongSites: [] }, r))
  );
  await page.waitForTimeout(600);
  const afterUnreg = await sw.evaluate(async () => {
    const list = await chrome.scripting.getRegisteredContentScripts();
    return list.filter((s) => s.id.startsWith("strong_")).length;
  });
  check("取消强力后注销脚本", afterUnreg === 0, `remaining=${afterUnreg}`);

  // 9) 一键提取正文：发消息 → 页面 Shadow UI 出现阅读层且有文字
  const extractRes = await sw.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    const t = tabs.find((x) => x.url && x.url.includes("blocked-page.html"));
    return await chrome.tabs.sendMessage(t.id, { type: "CU_EXTRACT" });
  }, TEST_URL);
  await page.waitForTimeout(200);
  const reader = await page.evaluate(() => {
    const host = document.getElementById("__copy_unlock_ui__");
    const sr = host && host.shadowRoot;
    const overlay = sr && sr.querySelector(".cu-overlay");
    const body = overlay && overlay.querySelector(".cu-body");
    return { hasOverlay: !!overlay, bodyLen: body ? body.textContent.length : 0 };
  });
  check(
    "一键提取正文（阅读层弹出且有文字）",
    extractRes && extractRes.ok && extractRes.chars > 0 && reader.hasOverlay && reader.bodyLen > 0,
    `resp=${JSON.stringify(extractRes)}, reader=${JSON.stringify(reader)}`
  );

  // 10) 划词浮窗复制：在干净页面制造选区 + mouseup → 浮窗按钮出现
  const page3 = await ctx.newPage();
  await page3.goto(TEST_URL, { waitUntil: "load" });
  await page3.waitForTimeout(600);
  const selBar = await page3.evaluate(async () => {
    const box = document.querySelector(".protected");
    const range = document.createRange();
    range.selectNodeContents(box);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250)); // 等入场动画
    const host = document.getElementById("__copy_unlock_ui__");
    const sr = host && host.shadowRoot;
    const bar = sr && sr.querySelector(".cu-bar");
    const btnCount = bar ? bar.querySelectorAll(".cu-bar-btn").length : 0;
    return {
      exists: !!bar,
      visible: bar ? bar.classList.contains("show") : false,
      btnCount,
    };
  });
  check(
    "划词浮窗工具条出现",
    selBar.exists && selBar.visible && selBar.btnCount >= 1,
    JSON.stringify(selBar)
  );

  // 11) P0「不破坏页面」：标准模式只中和复制类按键，不碰 Enter/空格/普通输入
  const page4 = await ctx.newPage();
  await page4.goto(TEST_URL, { waitUntil: "load" });
  await page4.waitForTimeout(400);
  const keys = await page4.evaluate(() => {
    const got = [];
    // 页面级监听器（document 冒泡）——被扩展中和的按键不会到达这里
    document.addEventListener("keydown", (e) => {
      got.push((e.ctrlKey || e.metaKey ? "MOD+" : "") + e.key);
    });
    const fire = (init) =>
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })
      );
    fire({ key: "Enter" });
    fire({ key: " " });
    fire({ key: "a" });
    fire({ key: "c", ctrlKey: true }); // 复制组合——应被中和，不到达页面
    return got;
  });
  check(
    "不破坏页面：Enter/空格/普通键放行，仅 Ctrl+C 被中和",
    keys.includes("Enter") &&
      keys.includes(" ") &&
      keys.includes("a") &&
      !keys.includes("MOD+c"),
    `页面收到的按键=${JSON.stringify(keys)}`
  );

  // 12) P0「不破坏页面」：普通点击照常触发（不中和 click/mousedown）
  const clicked = await page4.evaluate(() => {
    window.__clicked = false;
    document.getElementById("real-btn").click();
    return window.__clicked === true;
  });
  check("不破坏页面：普通按钮点击照常触发", clicked, `clicked=${clicked}`);
} catch (e) {
  check("测试运行异常", false, String(e && e.stack ? e.stack : e));
} finally {
  await ctx.close();
}

const passed = results.filter((r) => r.pass).length;
log(`\n=== ${passed}/${results.length} 通过 ===`);
process.exit(passed === results.length ? 0 : 1);
