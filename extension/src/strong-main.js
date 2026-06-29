/*
 * 复制解锁 · 强力钩子（主世界 MAIN）
 *
 * 只做「标准模式（隔离世界捕获中和）做不到」的事——因为这些需要改写页面自身的原型：
 *  1) 强制 attachShadow 为 open —— 让原本 closed 的 Shadow DOM 也能被标准模式的样式注入触达
 *  2) 改写 addEventListener —— 拒绝页面再注册禁复制类监听器（不含 mousedown/mouseup，避免破坏交互）
 *  3) 清空行内 on* 与 unselectable，并用 MutationObserver 持续清理
 *
 * 两种触发：被 background 动态注册（document_start，持久）或 popup 一键注入（按需）。
 */
(() => {
  "use strict";
  if (window.__cuStrong) return;
  window.__cuStrong = true;

  // 1) 强制打开 Shadow DOM（document_start 时生效，能覆盖之后创建的 shadow root）
  try {
    const origAttach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init) {
      const opts = Object.assign({}, init, { mode: "open" });
      return origAttach.call(this, opts);
    };
  } catch (_) {}

  // 2) 拒绝注册禁复制类监听器
  // 注意：本文件运行在页面 MAIN 世界，刻意不依赖 constants.js（避免向页面全局注入 CU），
  // 故此列表与 constants.js 的 EVENTS 有意重复，二者改动需同步。
  const BLOCKED = new Set([
    "copy",
    "cut",
    "beforecopy",
    "beforecut",
    "contextmenu",
    "selectstart",
    "dragstart",
  ]);
  try {
    const origAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, opts) {
      if (typeof type === "string" && BLOCKED.has(type.toLowerCase())) return;
      return origAdd.call(this, type, listener, opts);
    };
  } catch (_) {}

  // 3) 清理行内处理器 + unselectable
  const INLINE_PROPS = [
    "oncopy",
    "oncut",
    "onbeforecopy",
    "onbeforecut",
    "oncontextmenu",
    "onselectstart",
    "ondragstart",
  ];

  function cleanNode(node) {
    if (!node || node.nodeType !== 1) return;
    for (const p of INLINE_PROPS) {
      try {
        if (node[p]) node[p] = null;
      } catch (_) {}
    }
    try {
      if (node.hasAttribute && node.hasAttribute("unselectable")) {
        node.removeAttribute("unselectable");
      }
    } catch (_) {}
  }

  function sweep(root) {
    cleanNode(root);
    try {
      root.querySelectorAll &&
        root
          .querySelectorAll("[oncopy],[oncontextmenu],[onselectstart],[unselectable]")
          .forEach(cleanNode);
    } catch (_) {}
  }

  [document, document.documentElement, document.body].forEach((n) => n && cleanNode(n));
  if (document.documentElement) sweep(document.documentElement);

  try {
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.addedNodes) m.addedNodes.forEach((n) => sweep(n));
        if (m.type === "attributes") cleanNode(m.target);
      }
    });
    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["unselectable", ...INLINE_PROPS.map((p) => p.slice(2))],
    });
  } catch (_) {}
})();
