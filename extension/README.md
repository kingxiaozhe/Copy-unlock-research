# 复制解锁 · Copy Unlock

一键解除网页对**选中 / 复制 / 右键**的前端限制——让你**已经能看到**的内容能复制出来。

> 头部复制解锁扩展能做的它都能做——但它**从不破坏页面、从不弹广告、从不联网，而且开源**。
> （定位依据见 [竞品评论机会清单](../data/OPPORTUNITIES.md)：站点失效、破坏页面、塞广告是在世竞品最被诟病的三点。）

## 它能做什么

针对「纯前端禁复制」的网站（绝大多数）：

- 解除 CSS `user-select: none`（**含 Shadow DOM 穿透**）
- 中和 `copy` / `cut` / `contextmenu` / `selectstart` / `dragstart` 等被 `preventDefault` 的事件
- 放行被拦截的 `Ctrl/⌘ + C / X / A`
- 图标徽章显示本页开/关状态与**已拦截次数**
- **强力模式**：强制 `attachShadow` 为 open（触达 closed Shadow DOM）、改写 `addEventListener`、清理行内 `on*` 与 `unselectable`、`MutationObserver` 持续清理
  - 一次性：popup 的「强力解锁本页」
  - 持久：popup 的「本站始终强力」开关 → 后台动态注册 `document_start` 的 MAIN 世界脚本，刷新仍生效

便利功能（与解锁解耦，UI 挂在隔离的 Shadow DOM 宿主里）：

- **划词浮窗复制**：选中文字浮现「复制」按钮，点击写入剪贴板（popup 可关，默认开）
- **一键提取正文**：抽取页面主要文字，弹出可滚动阅读层 + 「复制全文」按钮（超长截断护栏 `MAX_EXTRACT_CHARS`）

## 原理（为什么不破坏页面）

不是「反 preventDefault」（做不到），而是**在 `window` 捕获阶段、比页面脚本更早**注册监听器，
对禁复制事件调 `stopImmediatePropagation()`——页面的取消处理器不会执行，浏览器默认行为照常发生。
全程不调 `preventDefault`，所以不会反向破坏页面交互。

## 安装（开发者模式加载）

1. Chrome / Edge 打开 `chrome://extensions`
2. 右上角打开「开发者模式」
3. 点「加载已解压的扩展程序」，选择本目录 `copy-unlock/`
4. 打开 `test/blocked-page.html` 验证：那段「禁复制」文字应可选中、复制、右键

## 使用

- 默认全站开启。点扩展图标可对**当前站点**单独关闭/开启（即时生效，无需刷新）。
- 顽固站点点「⚡ 强力解锁本页」。

## 明确不做（边界）

- ❌ 不绕过任何**付费墙 / VIP / 登录权限**（如百度文库付费下载）
- ❌ 不破解 DRM / 加密内容
- ❌ 不抓取你无权访问的内容

只处理「内容你本就能看到、仅被前端 JS/CSS 挡住复制」的情况。

## 隐私与权限（可自行核验）

**零联网、零追踪、零广告。** 全部设置仅存于本机 `chrome.storage.local`，不上传任何数据。
代码无 `fetch`/`XMLHttpRequest`/`sendBeacon`/`WebSocket`、无任何站外 URL、无 `eval`、无分析 SDK——
可在仓库根目录自行 grep 核验：

```bash
grep -rniE "fetch\(|XMLHttpRequest|sendBeacon|WebSocket|analytics|eval\(" src popup.js
```

权限用途（最小必要）：

| 权限 | 为什么需要 |
|---|---|
| `storage` | 记住「本站开关 / 始终强力 / 划词浮窗」等设置 |
| `scripting` | 「始终强力」站点动态注册脚本、「强力解锁本页」按需注入 |
| `activeTab` | popup 操作当前标签页 |
| `<all_urls>` | 页面**加载即自动解锁**（无需每页点一下）必须在所有站点注入；这是核心体验，会触发商店「深度审查」的黄色提示，属正常 |

## 不破坏页面

标准模式是**外科手术式**的：只在捕获阶段中和复制类事件，**不调用 `preventDefault`**、不中和 `mousedown`、
键盘只拦 `Ctrl/⌘ + C/X/A`——**不碰 Enter / 空格 / 普通输入与点击**（有回归测试覆盖，见下）。
> 强力模式会改写页面 `addEventListener` 并强制打开 Shadow DOM，**少数站点的 captcha / Cloudflare 验证可能受影响**，故设为按需 opt-in，不默认开启。

## 目录结构

```
copy-unlock/
├── manifest.json         # MV3 清单
├── popup.html / popup.js # 弹窗：本站开关 + 强力开关 + 一次性强力
├── src/
│   ├── constants.js      # 单一数据源：消息类型/存储键/事件列表/配色（三端共享）
│   ├── site-rules.js     # 站点适配规则注册表（核心解锁的扩展点，见 SITE-RULES.md）
│   ├── unlock.js         # 核心：捕获阶段中和 + CSS 注入(含 Shadow DOM) + 规则引擎（隔离世界）
│   ├── toolbar.js        # 便利功能：划词浮窗复制 + 一键提取正文（隔离世界，Shadow UI）
│   ├── strong-main.js    # 强力钩子：force-open Shadow DOM + 改写原型（主世界，自包含）
│   └── background.js     # SW：默认配置 + 强力动态注册/注销 + 徽章
├── SITE-RULES.md        # 站点规则的候选/排除清单与验证流程
└── test/
    ├── blocked-page.html     # 本地测试页（Light + Shadow DOM 两处禁复制区）
    ├── e2e.mjs               # Playwright 端到端测试（12 项断言，需浏览器）
    └── site-rules.test.mjs   # 站点规则注册表离线单元测试（无需浏览器，可进 CI）
```

### 架构要点

- **单一数据源**：`constants.js` 经 manifest（内容脚本首位）/ `importScripts`（SW）/ `<script>`（popup）三端共享，杜绝魔法字符串漂移。
- **两个世界分工**：隔离世界 `unlock.js` 做事件中和 + 样式注入 + 规则；主世界 `strong-main.js` 只做需改写页面原型的强力操作，刻意自包含不依赖 `constants.js`（不污染页面全局）。
- **扩展点**：站点专属适配一律登记到 `site-rules.js`，核心逻辑保持干净；规则只通过 `api`（`addCss` / `requestStrong` / `log`）作用，不碰全局。

## 测试

- **逻辑/视觉**：用任意静态服务器打开 `test/blocked-page.html`（含 Light DOM + Shadow DOM 两处禁复制区）。
- **端到端**（真实浏览器加载扩展，验证 background / 徽章 / 强力注册 / 消息通信）：

  ```bash
  # 需要 Playwright（含自带 Chromium）。系统 Chrome 137+ 已禁用命令行 --load-extension，
  # 故测试使用 Playwright 自带的 Chromium；手动在 chrome://extensions 加载不受此限制。
  python3 -m http.server 8731 &          # 在本目录起静态服务
  node test/e2e.mjs                       # 跑 12 项端到端断言
  ```

  覆盖：SW 启动、默认配置、标准解锁、徽章状态、本站开关即时生效、强力模式动态注册/注销、closed Shadow DOM force-open、一键提取正文、划词浮窗复制、**不破坏页面（Enter/空格/普通键放行、点击照常）**。

- **站点规则**（离线，无需浏览器/网络，适合 CI）：验证注册表结构、命中正确、付费/登录墙站点零命中、`apply` 不抛错。

  ```bash
  node test/site-rules.test.mjs
  ```

## 待办 / 下一步

- [ ] 图标（16/48/128 PNG，上架必需）
- [ ] 全局总开关 + 快捷键（commands API）
- [x] 针对性适配规则表（按 hostname 的特殊修复）—— 注册表 + 起步规则 + 离线测试已就位，逐站规则待真机验证后扩充（见 SITE-RULES.md）
- [ ] 划词复制 / 一键全文提取
- [ ] iframe 内嵌文档的跨域处理评估
