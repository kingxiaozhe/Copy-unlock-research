/*
 * 复制解锁 · 站点适配规则注册表
 *
 * 通用解锁（unlock.js）覆盖绝大多数「纯前端禁复制」。少数站点有特殊手段（自定义渲染、
 * 动态重加限制、非标准 DOM 结构、用更高 CSS 特异性盖过我们的通配样式等），在这里登记
 * 专门规则，保持核心逻辑干净。
 *
 * 规则形如：
 *   {
 *     id: 'feishu-docs',                                 // 唯一标识（仅字母/数字/连字符）
 *     match: (host, url) => host.endsWith('feishu.cn'),  // 命中条件
 *     apply: (api) => {                                  // 命中后执行；务必健壮、可重入
 *       api.addCss('.locked{user-select:text!important}');  // 追加站点专属样式（含 Shadow DOM）
 *       api.requestStrong();                                // 请求对本页启用强力模式
 *       api.log('feishu rule applied');
 *     },
 *   }
 *
 * api 提供的能力见 unlock.js 中 buildRuleApi()：{ host, url, addCss(css), requestStrong(), log() }。
 * 规则不应直接操作全局，只通过 api。
 *
 * 何时用哪种动作（按「破坏页面」风险从低到高）：
 *   1) addCss(selector{user-select:text!important})  —— 最安全。仅当站点用「类/ID 选择器 +
 *      !important」把 user-select:none 的特异性顶到我们通配 `*{...!important}` 之上时需要
 *      （!important 之间按特异性裁决，`.content` > `*`）。只动样式，绝不破坏交互。
 *   2) requestStrong()                               —— 当内容在 closed Shadow DOM、或站点脚本
 *      持续回写监听器/行内 on* 时。会改写页面 addEventListener 并 force-open Shadow DOM，
 *      ⚠️ 可能影响该站的 captcha/Cloudflare/富编辑器交互，故只对「内容展示型」站点用，
 *      不要对在线编辑器/表单应用（飞书编辑器、Teams、Gmail 等）默认开启。
 *
 * ⚠️ 边界（与 README 一致，不可逾越）：这里只放「内容本就可见、仅前端挡住复制」的适配，
 * 绝不放任何付费墙 / VIP / 登录权限绕过。下方「明确排除」列出的站点即属此类，故意不登记。
 *
 * 验证协议：新增/收窄任何规则前，先用 research 仓库的 src/site-probe.mjs 对该站「无扩展 vs
 * 加载扩展」实测（读真实剪贴板为权威信号），确认机制后再固化。详见 extension/SITE-RULES.md。
 */
(function (g) {
  "use strict";
  g.CU = g.CU || {};

  // 命中辅助：host 严格等于某域，或为其子域（避免 "moon.vn.evil.com" 之类误命中）。
  function onHost() {
    var suffixes = Array.prototype.slice.call(arguments);
    return function (host) {
      return suffixes.some(function (s) {
        return host === s || host.endsWith("." + s);
      });
    };
  }

  g.CU.siteRules = [
    // ───────────────────────── 已登记规则 ─────────────────────────
    // 现状：CSDN（阻止式）、简书（复制加水印）等真实大站，标准模式已实测全部搞定，无需登记。
    // 下方为「评论点名失效 + 公开内容 + 非编辑器应用」的起步规则，动作保守、可一键按站关闭。
    // 全部标注「⚠️ 待真机」：需用 site-probe.mjs 在真实页面确认后再收窄到精确选择器或保留。

    {
      id: "moon-vn",
      // 机制：越南学习/题库站，公开题目正文常被前端动态重加 user-select:none 与复制监听，
      //       一次性中和后可能被站点脚本回写。属「内容展示型」，强力模式破坏交互的风险低。
      // 动作：升级强力模式（持续清理 + 改写 addEventListener），不依赖易变类名。
      // 边界：仅公开可见的学习内容；登录/付费区不在范围。
      // 验证：⚠️ 待真机（site-probe.mjs 实测后固化或收窄为 addCss）。
      match: onHost("moon.vn"),
      apply: function (api) {
        api.requestStrong();
        api.log("moon.vn → strong mode requested");
      },
    },

    {
      id: "deviantart",
      // 机制：公开作品页对说明文字/正文禁选、屏蔽右键。contextmenu/selectstart 标准模式已中和；
      //       个别区块用类选择器 + !important 顶高 user-select:none，需同等特异性的样式回敬。
      // 动作：仅追加样式（最安全，不碰交互）。选择器为保守通配 + 常见容器，命不中即 no-op。
      // 验证：⚠️ 待真机（确认实际容器类名后把通配收窄，减少副作用）。
      match: onHost("deviantart.com"),
      apply: function (api) {
        api.addCss(
          [
            // 对带 class 的元素再上一道同 !important、更高特异性（含后代选择器）的可选样式
            "body [class], body [class] * {",
            "  -webkit-user-select: text !important;",
            "  user-select: text !important;",
            "}",
          ].join("\n")
        );
        api.log("deviantart → css override applied");
      },
    },

    // ───────────────────────── 模板（保持注释，避免误命中） ─────────────────
    // CSS 覆盖型（首选，最安全）：站点用 `.content{user-select:none!important}` 顶过我们的
    // 通配样式时，用同名/更高特异性选择器回敬即可，无需强力模式。
    // {
    //   id: "example-css",
    //   match: (host) => host === "doc.example.com",
    //   apply: (api) => api.addCss(".content, .content * { user-select: text !important; }"),
    // },
    //
    // 强力升级型：内容在 closed Shadow DOM 或站点持续回写监听器时。
    // {
    //   id: "example-strong",
    //   match: (host) => host.endsWith("example.com"),
    //   apply: (api) => api.requestStrong(),
    // },

    // ───────────────────────── 明确排除（故意不登记） ─────────────────────
    // 以下评论点名站点属「登录/付费墙」或「内容并非前端单纯挡住复制」，越界，绝不适配：
    //   · uworld.com / usmle 题库           —— 付费登录题库
    //   · bibliu.com                        —— 付费电子教材
    //   · creativefabrica.com（付费下载区） —— 付费素材
    // 以及「在线编辑器/应用」类（强力模式有破坏交互风险，不默认登记，确需时仅按需 opt-in）：
    //   · 飞书 feishu.cn / larksuite.com 编辑器、Teams、Gmail、Spotify、Google Maps 等
    //   详见 SITE-RULES.md 的「候选与排除」清单与判定依据。
  ];
})(typeof self !== "undefined" ? self : globalThis);
