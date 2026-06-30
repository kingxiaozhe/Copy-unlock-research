/*
 * 复制解锁 · 后台 Service Worker
 * - 初始化默认配置
 * - 维护「本站始终强力」的动态内容脚本注册（MAIN 世界，document_start，持久）
 * - 处理一次性「强力解锁本页」与站点规则的强力请求
 * - 根据各帧上报的状态/计数更新扩展图标徽章
 *
 * 注意：tabState 为内存态，SW 被回收后丢失；内容脚本会在下次拦截时重新上报，徽章随之恢复。
 */
importScripts("constants.js");
const C = self.CU;

const STRONG_FILE = "src/strong-main.js";

// ---------------- 默认配置 ----------------
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(
    [C.KEY.ENABLED, C.KEY.DISABLED_SITES, C.KEY.STRONG_SITES, C.KEY.SELECTION_BAR],
    (c) => {
      const patch = {};
      if (c[C.KEY.ENABLED] === undefined) patch[C.KEY.ENABLED] = true;
      if (!Array.isArray(c[C.KEY.DISABLED_SITES])) patch[C.KEY.DISABLED_SITES] = [];
      if (!Array.isArray(c[C.KEY.STRONG_SITES])) patch[C.KEY.STRONG_SITES] = [];
      if (c[C.KEY.SELECTION_BAR] === undefined) patch[C.KEY.SELECTION_BAR] = true;
      if (Object.keys(patch).length) chrome.storage.local.set(patch);
    }
  );
  syncStrong();
});
chrome.runtime.onStartup && chrome.runtime.onStartup.addListener(syncStrong);

// ---------------- 强力站点：动态注册 MAIN 世界脚本 ----------------
// 内容脚本 id 仅允许字母/数字/下划线，host 里的点号等需转义
const idFor = (h) => C.STRONG_ID_PREFIX + h.replace(/[^a-z0-9]/gi, "_");

async function syncStrong() {
  let strongSites = [];
  try {
    const got = await chrome.storage.local.get(C.KEY.STRONG_SITES);
    strongSites = got[C.KEY.STRONG_SITES] || [];
  } catch (_) {}
  const desired = new Map(strongSites.map((h) => [idFor(h), h]));

  let existing = [];
  try {
    existing = await chrome.scripting.getRegisteredContentScripts();
  } catch (_) {}
  const existingStrong = existing.filter((s) =>
    s.id.startsWith(C.STRONG_ID_PREFIX)
  );
  const existingIds = new Set(existingStrong.map((s) => s.id));

  const toRemove = existingStrong
    .filter((s) => !desired.has(s.id))
    .map((s) => s.id);
  const toAdd = [...desired.entries()]
    .filter(([id]) => !existingIds.has(id))
    .map(([id, h]) => ({
      id,
      matches: [`*://${h}/*`],
      js: [STRONG_FILE],
      runAt: "document_start",
      world: "MAIN",
      allFrames: true,
      persistAcrossSessions: true,
    }));

  if (toRemove.length) {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: toRemove });
    } catch (_) {}
  }
  if (toAdd.length) {
    try {
      await chrome.scripting.registerContentScripts(toAdd);
    } catch (_) {}
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[C.KEY.STRONG_SITES]) syncStrong();
});

// 一次性把强力脚本注入指定标签页（不持久）
function deepUnlockTab(tabId) {
  return chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    world: "MAIN",
    files: [STRONG_FILE],
  });
}

// ---------------- 消息处理 ----------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  // popup：一次性强力解锁某标签页
  if (msg.type === C.MSG.DEEP_UNLOCK && msg.tabId != null) {
    deepUnlockTab(msg.tabId)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true; // 异步响应
  }

  // 站点规则：请求对发起方所在标签页强力解锁
  if (msg.type === C.MSG.REQUEST_STRONG && sender.tab) {
    deepUnlockTab(sender.tab.id).catch(() => {});
    return;
  }

  // 各帧上报状态/计数 → 更新徽章
  if (msg.type === C.MSG.REPORT && sender.tab) {
    const tabId = sender.tab.id;
    const fid = sender.frameId || 0;
    const t = tabState[tabId] || (tabState[tabId] = {});
    t[fid] = { active: !!msg.active, count: msg.count | 0 };
    updateBadge(tabId);
  }
});

// ---------------- 徽章 ----------------
const tabState = {}; // tabId -> { frameId: {active, count} }

function updateBadge(tabId) {
  const frames = tabState[tabId];
  if (!frames) return;
  let active = false;
  let total = 0;
  for (const fid in frames) {
    if (frames[fid].active) active = true;
    total += frames[fid].count || 0;
  }
  let text, color;
  if (!active) {
    text = "off";
    color = C.BADGE.GRAY;
  } else if (total > 0) {
    text = total > 99 ? "99+" : String(total);
    color = C.BADGE.GREEN;
  } else {
    text = "ON";
    color = C.BADGE.GREEN;
  }
  try {
    chrome.action.setBadgeBackgroundColor({ tabId, color });
    chrome.action.setBadgeText({ tabId, text });
  } catch (_) {}
}

// 导航开始时重置该标签页状态与徽章
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    delete tabState[tabId];
    try {
      chrome.action.setBadgeText({ tabId, text: "" });
    } catch (_) {}
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabState[tabId];
});
