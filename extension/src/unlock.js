/*
 * 复制解锁 · 核心内容脚本（隔离世界，document_start）
 *
 * 原理：在 window 捕获阶段、比页面脚本更早注册监听器，对禁复制相关事件调用
 * stopImmediatePropagation()——页面用来取消默认行为的处理器（行内 on* / capture /
 * bubble / 动态添加的都包含）根本不会执行，于是浏览器的默认复制/选中/右键照常发生。
 * 我们绝不调用 preventDefault，所以不会反过来破坏页面。
 *
 * 依赖：constants.js、site-rules.js（在 manifest 中排在本文件之前）。
 */
(() => {
  "use strict";

  const C = self.CU; // 由 constants.js 提供
  const host = location.hostname;

  const state = { active: true };
  let count = 0; // 本页已拦截的禁复制尝试次数
  const injectedStyles = new Set(); // 已注入的 <style> 引用（含 Shadow DOM），用于完整回退

  // ---------------- 事件中和 ----------------
  function bump() {
    count++;
    report();
  }

  function neutralize(e) {
    if (!state.active) return;
    e.stopImmediatePropagation(); // 只阻断页面处理器，不 preventDefault
    bump();
  }

  function onKeydown(e) {
    if (!state.active) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (C.COPY_KEYS.includes((e.key || "").toLowerCase())) {
        e.stopImmediatePropagation();
        bump();
      }
    }
  }

  for (const type of C.EVENTS) window.addEventListener(type, neutralize, true);
  window.addEventListener("keydown", onKeydown, true);

  // ---------------- 样式注入（含 Shadow DOM 穿透） ----------------
  let extraCss = ""; // 站点规则追加的样式

  function styleHostOf(root) {
    // root = document → head/documentElement；root = ShadowRoot → 自身
    return root.nodeType === 9 ? root.head || root.documentElement : root;
  }

  function injectInto(root) {
    const target = styleHostOf(root);
    if (!target || !target.appendChild) return;
    // 去重：同一 root 已注入则跳过
    if (target.querySelector && target.querySelector("#" + C.STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = C.STYLE_ID;
    s.textContent = C.BASE_CSS + (extraCss ? "\n" + extraCss : "");
    target.appendChild(s);
    injectedStyles.add(s);
  }

  // 遍历某个根下所有可访问的 shadow root 并注入；强力模式会把 closed 强制成 open，使其可触达
  function injectShadowsWithin(root) {
    let nodes;
    try {
      nodes = (root.querySelectorAll && root.querySelectorAll("*")) || [];
    } catch (_) {
      return;
    }
    for (const el of nodes) {
      if (el.shadowRoot) {
        injectInto(el.shadowRoot);
        injectShadowsWithin(el.shadowRoot);
      }
    }
  }

  function injectAll() {
    if (!state.active) return;
    injectInto(document);
    injectShadowsWithin(document);
  }

  function removeAll() {
    for (const s of injectedStyles) {
      try {
        s.remove();
      } catch (_) {}
    }
    injectedStyles.clear();
  }

  // 仅扫描新增子树（避免每次 DOM 变动全文档 querySelectorAll，繁忙页面会卡）
  function scanAddedNode(node) {
    if (!state.active || !node || node.nodeType !== 1) return;
    if (node.shadowRoot) {
      injectInto(node.shadowRoot);
      injectShadowsWithin(node.shadowRoot);
    }
    injectShadowsWithin(node);
  }

  // ---------------- 状态/计数上报（防抖），用于图标徽章 ----------------
  let reportTimer = null;
  function report() {
    if (reportTimer) return;
    reportTimer = setTimeout(() => {
      reportTimer = null;
      try {
        chrome.runtime.sendMessage({
          type: C.MSG.REPORT,
          active: state.active,
          count,
        });
      } catch (_) {}
    }, 400);
  }

  function setActive(on) {
    state.active = on;
    if (on) injectAll();
    else removeAll();
    report();
  }

  // ---------------- 站点适配规则 ----------------
  function buildRuleApi() {
    return {
      host,
      url: location.href,
      // 追加站点专属 CSS（会合入后续注入，并补到已注入的样式上）
      addCss(css) {
        if (!css) return;
        extraCss += "\n" + css;
        for (const s of injectedStyles) {
          try {
            s.textContent = C.BASE_CSS + "\n" + extraCss;
          } catch (_) {}
        }
      },
      // 请求对本页启用强力模式（由 background 注入 MAIN 世界脚本）
      requestStrong() {
        try {
          chrome.runtime.sendMessage({ type: C.MSG.REQUEST_STRONG });
        } catch (_) {}
      },
      log: (...a) => console.debug("[copy-unlock:rule]", ...a),
    };
  }

  function applySiteRules() {
    const rules = (self.CU && self.CU.siteRules) || [];
    if (!rules.length) return;
    const api = buildRuleApi();
    for (const r of rules) {
      try {
        if (r && typeof r.match === "function" && r.match(host, location.href)) {
          r.apply && r.apply(api);
        }
      } catch (e) {
        console.debug("[copy-unlock] 站点规则执行失败:", r && r.id, e);
      }
    }
  }

  // ---------------- 启动 ----------------
  function onReady(fn) {
    if (document.documentElement) fn();
    else document.addEventListener("DOMContentLoaded", fn, { once: true });
  }

  onReady(injectAll);
  document.addEventListener("DOMContentLoaded", injectAll, { once: true });

  // 监听 DOM 变化，仅给新增子树补样式
  onReady(() => {
    try {
      const mo = new MutationObserver((muts) => {
        if (!state.active) return;
        for (const m of muts) {
          if (m.addedNodes) m.addedNodes.forEach(scanAddedNode);
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (_) {}
  });

  onReady(applySiteRules);

  // ---------------- 配置：全局开关 + 本站禁用名单 ----------------
  try {
    chrome.storage.local.get([C.KEY.ENABLED, C.KEY.DISABLED_SITES], (cfg) => {
      const enabled = cfg[C.KEY.ENABLED] !== false;
      const list = cfg[C.KEY.DISABLED_SITES];
      const disabled = Array.isArray(list) && list.includes(host);
      setActive(enabled && !disabled);
    });
  } catch (_) {
    report();
  }

  // ---------------- 与 popup 通信 ----------------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === C.MSG.SET_ACTIVE) {
      setActive(!!msg.active);
      sendResponse({ ok: true, active: state.active });
      return true;
    }
    if (msg.type === C.MSG.STATUS) {
      sendResponse({ active: state.active, host, count });
      return true;
    }
    // 其余消息（如 CU_EXTRACT）由其他模块处理，不占用响应通道
  });
})();
