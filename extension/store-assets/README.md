# 商店素材（Chrome Web Store）

本目录存放上架所需的图片素材与其 HTML 源文件，以及商店表单文案。
`build-zip.mjs` 的排除清单含 `store-assets`，故**本目录不会被打进上传包**。

## 图片清单

| 文件 | 商店用途 | 规格 | 源文件 |
|---|---|---|---|
| `screenshot-1-before-after.png` | 屏幕截图（必填，≥1 张） | 1280×800 RGB | `shot-before-after.html` |
| `screenshot-2-popup.png` | 屏幕截图 | 1280×800 RGB | `shot-popup.html` |
| `promo-marquee-1400x560.png` | 顶部宣传图块（选填） | 1400×560 RGB | `promo-marquee.html` |
| `promo-small-440x280.png` | 小型宣传图块（选填） | 440×280 RGB | `promo-small.html` |

商店图标（128×128）直接用 `../icons/icon128.png`。

> 截图为**忠实示意**：呈现的是真实功能（划词选区、浮窗复制按钮、ON 徽章、零联网文案），
> 不是虚构 UI，符合商店对截图“代表真实产品”的要求。

## 复现（无需安装依赖）

用系统/Playwright 自带的 Chromium 无头截图。HTML 用相对路径引用 `../icons/icon128.png`，
故须在本目录（`extension/store-assets/`）下运行：

```bash
CHROME=/path/to/chrome   # 例如 Playwright 的 chromium
render(){ "$CHROME" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=$2,$3 --screenshot="$4" "$1"; }
render shot-before-after.html 1280 800 screenshot-1-before-after.png
render shot-popup.html        1280 800 screenshot-2-popup.png
render promo-marquee.html     1400 560 promo-marquee-1400x560.png
render promo-small.html        440 280 promo-small-440x280.png
```

注意：本机渲染要求装有中文字体（如 `wqy-zenhei`），否则中文显示为方块。
背景须用**纯色**置于 `html,body`（CSS canvas 背景传播规则），渐变放在子元素上此构建会在底部留白。

## 商店表单文案

**标题（来自 manifest）**：复制解锁 · Copy Unlock
**摘要（来自 manifest）**：一键解除网页对选中 / 复制 / 右键的前端限制，让能看到的内容能复制。
**类别**：工具（Tools）
**语言**：中文（简体）

**说明（详细描述）**：

```
复制解锁 · Copy Unlock —— 一键解除网页对「选中 / 复制 / 右键」的前端限制，让你已经能看到的内容能复制出来。

【它能做什么】
• 解除 CSS user-select:none 禁止选中（含 Shadow DOM 穿透）
• 中和被 preventDefault 的 copy / cut / contextmenu / selectstart / dragstart 事件
• 放行被拦截的 Ctrl/⌘ + C / X / A
• 强力模式（按需）：强制打开 closed Shadow DOM、清理顽固的行内 on* 限制，应对更难的站点
• 划词浮窗复制：选中文字即浮现「复制」按钮
• 一键提取正文：抽取页面主要文字，弹出可滚动阅读层 + 复制全文
• 图标徽章实时显示当前页的开/关状态与已拦截次数
• 可对单个网站单独关闭/开启，设置自动记住

【为什么不会破坏页面】
不是粗暴地反 preventDefault，而是在事件捕获阶段比页面脚本更早介入、只中和禁复制相关事件，全程不调用 preventDefault，也不拦截 Enter / 空格 / 普通输入与点击。所以解锁的同时不会把表单回车、快捷键、播放器等正常功能弄坏。

【干净、可信】
✓ 零联网：不发起任何网络请求，所有设置只存在你本机
✓ 零追踪、零广告：没有分析 SDK、没有右键菜单广告
✓ 开源：代码可自行核验

【明确不做（边界）】
✗ 不绕过任何付费墙 / VIP / 登录权限
✗ 不破解 DRM / 加密内容
✗ 不抓取你无权访问的内容
只处理「内容你本就能看到、仅被前端 JS/CSS 挡住复制」的情况。
```

## 提交注意

- `<all_urls>` 会触发商店「深度审查」黄色提示——正常。理由：页面加载即自动解锁需在所有站点注入内容脚本。
- 数据用途声明照实勾「不收集」（代码无 fetch / 分析 SDK，与说明一致）。
- 上传扩展包用仓库根据 `extension/` 打的 zip（运行时文件，manifest 无 `key`）。
