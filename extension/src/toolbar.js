/*
 * 复制解锁 · 便利功能（隔离世界，document_start）
 *
 * 与「解除限制」(unlock.js) 解耦的增益功能：
 *  1) 划词浮窗复制——选中文字后浮现「复制」按钮，点击写入剪贴板（可在 popup 关闭）
 *  2) 一键提取正文——popup 触发，抽取页面主要文字，弹出可滚动阅读层 + 复制按钮
 *
 * 所有 UI 挂在一个 Shadow DOM 宿主里，与页面 CSS 互不干扰。
 * 依赖：constants.js（manifest 中排在本文件之前）。
 */
(() => {
  "use strict";

  const C = self.CU;
  const host = location.hostname;

  // 病态输入护栏：超大页面/超长正文不拖垮渲染与剪贴板
  const MAX_EXTRACT_CHARS = 500000; // 提取正文上限，超出截断并提示
  const MAX_CONTAINERS = 5000; // 正文候选容器扫描上限，超出则停止打分（退化为兜底）

  // 仅在顶层文档提供便利 UI（iframe 内不弹浮窗/阅读层，避免重复与定位错乱）
  if (window.top !== window) return;

  const cfg = { enabled: true, selectionBarOn: true };

  // ---------------- UI 宿主（Shadow DOM 隔离） ----------------
  let shadow = null;
  function ui() {
    if (shadow) return shadow;
    const hostEl = document.createElement("div");
    hostEl.id = C.UI_HOST_ID;
    // 宿主本身不占布局、不拦截事件；内部元素各自开启 pointer-events
    hostEl.style.cssText =
      "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    (document.body || document.documentElement).appendChild(hostEl);
    shadow = hostEl.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    shadow.appendChild(style);
    return shadow;
  }

  const STYLE = `
    /* ---- 划词浮窗工具条（暗色玻璃，居中悬浮于选区，带指向箭头）---- */
    .cu-bar {
      position: fixed; pointer-events: auto; z-index: 2;
      display: flex; align-items: center; gap: 2px; padding: 4px;
      font: 13px/1 -apple-system, system-ui, "PingFang SC", sans-serif;
      color: #fff; background: rgba(28, 30, 38, .96);
      -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
      border: .5px solid rgba(255,255,255,.12); border-radius: 11px;
      box-shadow: 0 8px 28px rgba(0,0,0,.34), 0 2px 6px rgba(0,0,0,.22);
      white-space: nowrap; user-select: none;
      opacity: 0; visibility: hidden;
      transform: translateY(6px) scale(.96); transform-origin: center bottom;
      transition: opacity .14s ease, transform .16s cubic-bezier(.34,1.56,.64,1), visibility .14s;
    }
    .cu-bar.below { transform-origin: center top; transform: translateY(-6px) scale(.96); }
    .cu-bar.show { opacity: 1; visibility: visible; transform: translateY(0) scale(1); }

    .cu-bar-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 12px; border-radius: 8px; cursor: pointer;
      color: #f3f4f6; transition: background .12s ease, color .12s ease;
    }
    .cu-bar-btn:hover { background: rgba(255,255,255,.13); }
    .cu-bar-btn:active { background: rgba(255,255,255,.2); }
    .cu-bar-btn svg { width: 15px; height: 15px; flex: none; }
    .cu-bar-btn.ok { color: #4ade80; }
    .cu-bar-sep { width: .5px; align-self: stretch; margin: 4px 1px; background: rgba(255,255,255,.14); }

    .cu-caret {
      position: absolute; width: 10px; height: 10px;
      background: rgba(28, 30, 38, .96);
      border: .5px solid rgba(255,255,255,.12); border-top: 0; border-left: 0;
    }
    .cu-bar:not(.below) .cu-caret { bottom: -5px; transform: rotate(45deg); }
    .cu-bar.below .cu-caret { top: -5px; transform: rotate(-135deg); }

    .cu-overlay {
      position: fixed; inset: 0; pointer-events: auto;
      background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center;
    }
    .cu-panel {
      width: min(760px, 92vw); max-height: 84vh; display: flex; flex-direction: column;
      background: #fff; color: #1f2328; border-radius: 12px; overflow: hidden;
      box-shadow: 0 12px 48px rgba(0,0,0,.35);
      font: 14px/1.7 -apple-system, system-ui, "PingFang SC", sans-serif;
    }
    .cu-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; border-bottom: 1px solid #e5e7eb;
    }
    .cu-head .t { font-weight: 600; font-size: 14px; }
    .cu-head .meta { color: #656d76; font-size: 12px; margin-left: 8px; font-weight: 400; }
    .cu-actions { display: flex; gap: 8px; }
    .cu-btn {
      padding: 6px 12px; border-radius: 8px; font-size: 13px; cursor: pointer; border: 1px solid #2563eb;
      background: #2563eb; color: #fff;
    }
    .cu-btn.ghost { background: #fff; color: #2563eb; }
    .cu-btn.ok { background: #16a34a; border-color: #16a34a; color: #fff; }
    .cu-body { padding: 16px; overflow: auto; white-space: pre-wrap; word-break: break-word; user-select: text; }
    .cu-empty { color: #656d76; }
  `;

  // ---------------- 剪贴板 ----------------
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      // 回退：execCommand（需在用户手势内调用，本函数均由点击触发）
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;top:-9999px;opacity:0;";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch (__) {
        return false;
      }
    }
  }

  // ---------------- 划词浮窗工具条 ----------------
  const ICON = {
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    quote:
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h5v6c0 2.5-1.5 4-4 4.5l-.6-1.4C8.7 15.7 9.5 15 9.5 13.5H7V7zm7 0h5v6c0 2.5-1.5 4-4 4.5l-.6-1.4c1.3-.4 2.1-1.1 2.1-2.6H14V7z"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  };

  // 动作列表——扩展点：加新动作（搜索、翻译等）只需在此追加一项
  const ACTIONS = [
    {
      id: "copy",
      label: "复制",
      icon: ICON.copy,
      run: (text) => copyText(text),
    },
    {
      id: "quote",
      label: "引用",
      icon: ICON.quote,
      run: (text) => copyText(text.replace(/^/gm, "> ")),
    },
  ];

  let bar = null;
  let caret = null;
  const btnEls = {};
  let resetTimer = null;

  function selectionText() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return "";
    return (sel.toString() || "").trim();
  }

  function barAvailable() {
    return cfg.enabled && cfg.selectionBarOn;
  }

  function buildBar() {
    bar = document.createElement("div");
    bar.className = "cu-bar";
    bar.addEventListener("mousedown", (e) => e.preventDefault()); // 不夺走选区
    ACTIONS.forEach((action, i) => {
      if (i > 0) {
        const sep = document.createElement("div");
        sep.className = "cu-bar-sep";
        bar.appendChild(sep);
      }
      const btn = document.createElement("div");
      btn.className = "cu-bar-btn";
      btn.innerHTML = `${action.icon}<span>${action.label}</span>`;
      btn.addEventListener("click", () => onAction(action, btn));
      bar.appendChild(btn);
      btnEls[action.id] = btn;
    });
    caret = document.createElement("div");
    caret.className = "cu-caret";
    bar.appendChild(caret);
    ui().appendChild(bar);
  }

  async function onAction(action, btn) {
    const text = selectionText();
    if (!text) return;
    const ok = await action.run(text);
    const labelEl = btn.querySelector("span");
    const ok_ = ok !== false;
    btn.innerHTML = `${ok_ ? ICON.check : action.icon}<span>${
      ok_ ? "已复制" : "失败"
    }</span>`;
    btn.classList.toggle("ok", ok_);
    clearTimeout(resetTimer);
    resetTimer = setTimeout(hideBar, 850);
  }

  function resetButtons() {
    for (const action of ACTIONS) {
      const btn = btnEls[action.id];
      if (btn) {
        btn.innerHTML = `${action.icon}<span>${action.label}</span>`;
        btn.classList.remove("ok");
      }
    }
  }

  function hideBar() {
    if (bar) bar.classList.remove("show");
  }

  function showBar() {
    if (!barAvailable()) return hideBar();
    const text = selectionText();
    if (!text) return hideBar();
    const sel = window.getSelection();
    let rect;
    try {
      rect = sel.getRangeAt(0).getBoundingClientRect();
    } catch (_) {
      return hideBar();
    }
    if (!rect || (!rect.width && !rect.height)) return hideBar();

    if (!bar) buildBar();
    resetButtons();

    const PAD = 8;
    const GAP = 10; // 工具条与选区的间距（含箭头）
    const w = bar.offsetWidth;
    const h = bar.offsetHeight;
    const selMidX = rect.left + rect.width / 2;

    // 水平居中于选区，限制在视口内
    let left = selMidX - w / 2;
    left = Math.max(PAD, Math.min(left, window.innerWidth - w - PAD));

    // 默认在选区上方；上方空间不足则翻到下方
    const above = rect.top - h - GAP >= PAD;
    const top = above ? rect.top - h - GAP : rect.bottom + GAP;

    bar.classList.toggle("below", !above);
    bar.style.left = left + "px";
    bar.style.top = top + "px";

    // 箭头指向选区中心（即使工具条被夹到边缘）
    let caretLeft = selMidX - left - 5;
    caretLeft = Math.max(12, Math.min(caretLeft, w - 22));
    caret.style.left = caretLeft + "px";

    // 触发入场动画
    requestAnimationFrame(() => bar.classList.add("show"));
  }

  function safeShowBar() {
    try {
      showBar();
    } catch (e) {
      console.debug("[copy-unlock] 划词浮窗异常:", e);
    }
  }

  // 选区变化后再判断（mouseup 时选区可能尚未更新）
  document.addEventListener("mouseup", () => setTimeout(safeShowBar, 0), true);
  document.addEventListener("scroll", hideBar, true);
  document.addEventListener(
    "mousedown",
    (e) => {
      // 点到工具条本身不隐藏（工具条在 shadow 里，e.target 是宿主）
      if (e.target && e.target.id === C.UI_HOST_ID) return;
      hideBar();
    },
    true
  );

  // ---------------- 一键提取正文 ----------------
  function extractMainText() {
    const pick =
      document.querySelector("article") ||
      document.querySelector("main") ||
      bestByParagraphs() ||
      document.body;
    let text = ((pick && pick.innerText) || "").replace(/\n{3,}/g, "\n\n").trim();
    // 超长正文截断，避免渲染/写剪贴板卡顿
    if (text.length > MAX_EXTRACT_CHARS) {
      text =
        text.slice(0, MAX_EXTRACT_CHARS) +
        `\n\n…（正文过长，已截断至 ${MAX_EXTRACT_CHARS} 字）`;
    }
    return text;
  }

  // 在常见块级容器中，选出包含 <p> 文字量最大的那个；扫描量超上限即停止（退化为兜底）
  function bestByParagraphs() {
    let best = null;
    let bestLen = 0;
    const containers = document.querySelectorAll(
      "div, section, td, .content, #content, [role='main']"
    );
    const limit = Math.min(containers.length, MAX_CONTAINERS);
    for (let i = 0; i < limit; i++) {
      const el = containers[i];
      const ps = el.querySelectorAll(":scope > p");
      if (ps.length < 2) continue;
      let len = 0;
      for (const p of ps) len += (p.innerText || "").length;
      if (len > bestLen) {
        bestLen = len;
        best = el;
      }
    }
    return bestLen > 200 ? best : null;
  }

  function showReader(text) {
    const root = ui();
    closeReader();
    const overlay = document.createElement("div");
    overlay.className = "cu-overlay";
    overlay.dataset.cuReader = "1";

    const panel = document.createElement("div");
    panel.className = "cu-panel";

    const head = document.createElement("div");
    head.className = "cu-head";
    const title = document.createElement("div");
    title.className = "t";
    const chars = text.length;
    title.innerHTML = `提取正文 <span class="meta">${chars} 字</span>`;
    const actions = document.createElement("div");
    actions.className = "cu-actions";
    const copyAll = document.createElement("button");
    copyAll.className = "cu-btn";
    copyAll.textContent = "复制全文";
    copyAll.addEventListener("click", async () => {
      const ok = await copyText(text);
      copyAll.textContent = ok ? "✓ 已复制" : "复制失败";
      copyAll.classList.toggle("ok", ok);
    });
    const close = document.createElement("button");
    close.className = "cu-btn ghost";
    close.textContent = "关闭";
    close.addEventListener("click", closeReader);
    actions.append(copyAll, close);
    head.append(title, actions);

    const body = document.createElement("div");
    body.className = "cu-body";
    if (chars) body.textContent = text;
    else {
      body.className += " cu-empty";
      body.textContent = "未能提取到正文文字。可改用划词复制，或点「强力解锁本页」后重试。";
    }

    panel.append(head, body);
    overlay.appendChild(panel);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeReader();
    });
    root.appendChild(overlay);
    return chars;
  }

  function closeReader() {
    if (!shadow) return;
    const old = shadow.querySelector('[data-cu-reader="1"]');
    if (old) old.remove();
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeReader();
  });

  // ---------------- 配置 + 消息 ----------------
  function loadCfg() {
    try {
      chrome.storage.local.get(
        [C.KEY.ENABLED, C.KEY.DISABLED_SITES, C.KEY.SELECTION_BAR],
        (c) => {
          const globalOn = c[C.KEY.ENABLED] !== false;
          const list = c[C.KEY.DISABLED_SITES];
          const disabled = Array.isArray(list) && list.includes(host);
          cfg.enabled = globalOn && !disabled;
          cfg.selectionBarOn = c[C.KEY.SELECTION_BAR] !== false;
          if (!barAvailable()) hideCopyBtn();
        }
      );
    } catch (_) {}
  }
  loadCfg();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (
      changes[C.KEY.ENABLED] ||
      changes[C.KEY.DISABLED_SITES] ||
      changes[C.KEY.SELECTION_BAR]
    ) {
      loadCfg();
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === C.MSG.EXTRACT) {
      try {
        const chars = showReader(extractMainText());
        sendResponse({ ok: true, chars });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return true;
    }
  });
})();
