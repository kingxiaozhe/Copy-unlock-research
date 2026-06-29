/*
 * 复制解锁 · 共享常量（单一数据源）
 *
 * 在三种环境共享，避免魔法字符串漂移：
 *  - 内容脚本（隔离世界）：在 manifest 的 js 数组里排在 unlock.js 之前，共享 globalThis
 *  - Service Worker：通过 importScripts("constants.js") 载入
 *  - popup：通过 <script src> 在 popup.js 之前载入
 *
 * 注意：MAIN 世界的 strong-main.js 刻意不依赖本文件（不污染页面全局），其少量常量自包含。
 */
(function (g) {
  "use strict";
  g.CU = {
    // 消息类型
    MSG: {
      REPORT: "CU_REPORT", // content → bg：上报本帧状态/计数
      SET_ACTIVE: "CU_SET_ACTIVE", // popup → content：即时开/关本站
      STATUS: "CU_STATUS", // popup → content：查询状态/计数
      DEEP_UNLOCK: "CU_DEEP_UNLOCK", // popup → bg：一次性强力解锁某标签页
      REQUEST_STRONG: "CU_REQUEST_STRONG", // content → bg：站点规则请求对本帧所在页强力解锁
      EXTRACT: "CU_EXTRACT", // popup → content：提取正文并弹出阅读层
    },
    // storage.local 键
    KEY: {
      ENABLED: "enabled", // 全局总开关
      DISABLED_SITES: "disabledSites", // 本站禁用名单（hostname[]）
      STRONG_SITES: "strongSites", // 本站始终强力名单（hostname[]）
      SELECTION_BAR: "selectionBar", // 划词浮窗复制开关（默认开）
    },
    // 页面常用来取消默认行为的事件（不含 select：几乎不用于禁复制，却干扰表单/输入框）
    EVENTS: [
      "copy",
      "cut",
      "beforecopy",
      "beforecut",
      "contextmenu",
      "selectstart",
      "dragstart",
    ],
    // 需要放行的复制类快捷键（配合 Ctrl/⌘）
    COPY_KEYS: ["c", "x", "a"],
    // 注入样式元素的 id（用于去重/回退）
    STYLE_ID: "__copy_unlock_style__",
    // 便利功能 UI 宿主元素 id（划词浮窗 + 阅读层挂在它的 Shadow DOM 里，与页面样式隔离）
    UI_HOST_ID: "__copy_unlock_ui__",
    // 强制可选中的基础样式
    BASE_CSS: [
      "*, *::before, *::after {",
      "  -webkit-user-select: text !important;",
      "  -moz-user-select: text !important;",
      "  -ms-user-select: text !important;",
      "  user-select: text !important;",
      "  -webkit-touch-callout: default !important;",
      "}",
    ].join("\n"),
    // 徽章配色
    BADGE: { GREEN: "#16a34a", GRAY: "#9ca3af" },
    // 强力脚本注册的 id 前缀
    STRONG_ID_PREFIX: "strong_",
  };
})(typeof self !== "undefined" ? self : globalThis);
