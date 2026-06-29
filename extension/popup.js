/* 复制解锁 · Popup 逻辑（依赖 constants.js 提供的 self.CU） */

const C = self.CU;
const $ = (id) => document.getElementById(id);
const hostEl = $("host");
const badgeEl = $("badge");
const countEl = $("count");
const toggleEl = $("toggle");
const strongEl = $("strong");
const selbarEl = $("selbar");
const extractEl = $("extract");
const deepEl = $("deep");

let tab = null;
let host = "";
let statusTimer = null;

function setBadge(on) {
  badgeEl.textContent = on ? "已开启" : "已关闭";
  badgeEl.className = "badge " + (on ? "on" : "off");
}

function setCount(n) {
  if (n > 0) {
    countEl.textContent = `本页已拦截 ${n} 次复制限制`;
    countEl.className = "count";
  } else {
    countEl.textContent = "本页暂未触发复制限制";
    countEl.className = "count zero";
  }
}

const isWebUrl = (url) => /^https?:\/\//i.test(url || "");

// 读取数组型配置，保证总是数组
async function getList(key) {
  const cfg = await chrome.storage.local.get(key);
  return Array.isArray(cfg[key]) ? cfg[key] : [];
}

async function init() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  tab = t;

  if (!tab || !isWebUrl(tab.url)) {
    hostEl.textContent = "此页面不支持（非网页）";
    countEl.textContent = "";
    toggleEl.disabled = strongEl.disabled = deepEl.disabled = true;
    selbarEl.disabled = extractEl.disabled = true;
    setBadge(false);
    return;
  }

  host = new URL(tab.url).hostname;
  hostEl.textContent = host;

  const cfg = await chrome.storage.local.get([
    C.KEY.ENABLED,
    C.KEY.DISABLED_SITES,
    C.KEY.STRONG_SITES,
    C.KEY.SELECTION_BAR,
  ]);
  const globalOn = cfg[C.KEY.ENABLED] !== false;
  const disabledSites = Array.isArray(cfg[C.KEY.DISABLED_SITES])
    ? cfg[C.KEY.DISABLED_SITES]
    : [];
  const strongSites = Array.isArray(cfg[C.KEY.STRONG_SITES])
    ? cfg[C.KEY.STRONG_SITES]
    : [];
  const siteOn = globalOn && !disabledSites.includes(host);

  toggleEl.checked = siteOn;
  strongEl.checked = strongSites.includes(host);
  selbarEl.checked = cfg[C.KEY.SELECTION_BAR] !== false;
  setBadge(siteOn);

  refreshStatus();
  statusTimer = setInterval(refreshStatus, 1000);
}

async function refreshStatus() {
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: C.MSG.STATUS });
    if (res) {
      setBadge(res.active);
      setCount(res.count || 0);
    }
  } catch (_) {
    countEl.textContent = "本页脚本未加载，刷新页面后生效";
    countEl.className = "count zero";
  }
}

toggleEl.addEventListener("change", async () => {
  const on = toggleEl.checked;
  let disabledSites = await getList(C.KEY.DISABLED_SITES);
  if (on) disabledSites = disabledSites.filter((h) => h !== host);
  else if (!disabledSites.includes(host)) disabledSites.push(host);
  await chrome.storage.local.set({ [C.KEY.DISABLED_SITES]: disabledSites });
  setBadge(on);
  try {
    await chrome.tabs.sendMessage(tab.id, { type: C.MSG.SET_ACTIVE, active: on });
  } catch (_) {}
});

strongEl.addEventListener("change", async () => {
  const on = strongEl.checked;
  let strongSites = await getList(C.KEY.STRONG_SITES);
  if (on && !strongSites.includes(host)) strongSites.push(host);
  else if (!on) strongSites = strongSites.filter((h) => h !== host);
  // background 监听 storage 变化自动注册/注销持久脚本
  await chrome.storage.local.set({ [C.KEY.STRONG_SITES]: strongSites });
  // 开启时对当前页立即注入一次，省去刷新
  if (on) {
    try {
      await chrome.runtime.sendMessage({ type: C.MSG.DEEP_UNLOCK, tabId: tab.id });
    } catch (_) {}
  }
});

selbarEl.addEventListener("change", async () => {
  // background 监听 storage 变化已不需要；内容脚本自行监听 storage 实时生效
  await chrome.storage.local.set({ [C.KEY.SELECTION_BAR]: selbarEl.checked });
});

extractEl.addEventListener("click", async () => {
  const original = extractEl.textContent;
  extractEl.disabled = true;
  extractEl.textContent = "提取中…";
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: C.MSG.EXTRACT });
    if (res && res.ok) {
      extractEl.textContent = `✓ 已弹出（${res.chars} 字）`;
      window.close(); // 阅读层已在页面弹出，关闭 popup 让用户阅读
      return;
    }
    extractEl.textContent = "提取失败";
  } catch (_) {
    extractEl.textContent = "本页脚本未加载，刷新后重试";
  }
  setTimeout(() => {
    extractEl.disabled = false;
    extractEl.textContent = original;
  }, 1800);
});

deepEl.addEventListener("click", async () => {
  deepEl.disabled = true;
  deepEl.textContent = "解锁中…";
  try {
    const res = await chrome.runtime.sendMessage({
      type: C.MSG.DEEP_UNLOCK,
      tabId: tab.id,
    });
    deepEl.textContent = res && res.ok ? "✓ 已强力解锁" : "失败，重试";
  } catch (_) {
    deepEl.textContent = "失败，重试";
  }
  setTimeout(() => {
    deepEl.disabled = false;
    deepEl.textContent = "⚡ 强力解锁本页（仅这次）";
  }, 1500);
});

window.addEventListener("unload", () => statusTimer && clearInterval(statusTimer));

init();
