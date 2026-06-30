# 站点适配规则 · 候选与排除清单

`src/site-rules.js` 是核心解锁（`unlock.js`）的扩展点：通用解锁搞不定的少数站点在此登记
专门规则，核心逻辑保持干净。本文件记录**候选站点的分类、判定依据与验证流程**，让规则的
增删有据可查，而不是凭猜测堆选择器。

## 何时需要一条规则

标准模式（捕获阶段中和 + 通配 `*{user-select:text!important}` + 开放 Shadow DOM 注入）
已覆盖绝大多数前端禁复制。需要登记规则的，只有这几类「标准模式够不到」的情况：

| 失效机制 | 现象 | 推荐动作（取最小破坏） |
|---|---|---|
| **CSS 特异性盖过** | 站点用 `.content{user-select:none!important}` —— `!important` 之间按特异性裁决，类选择器 > 我们的通配 `*` | `api.addCss('.content,.content *{user-select:text!important}')`（**最安全，不碰交互**） |
| **closed Shadow DOM** | 正文在 `attachShadow({mode:'closed'})` 里，样式注入触达不到 | `api.requestStrong()`（force-open Shadow DOM） |
| **持续回写** | 站点脚本不断重新挂 copy/selectstart 监听或行内 `on*` | `api.requestStrong()`（改写 `addEventListener` + MutationObserver 持续清理） |
| **文字渲染成图/canvas** | 正文没有可选文本节点（如豆丁） | ❌ 规则无能为力 → 属 OCR 路线，不在此处理 |

> 动作优先级：**能用 `addCss` 就不用 `requestStrong`**。强力模式会改写页面原型，
> 对 captcha / Cloudflare / 富编辑器有破坏风险（见 README「不破坏页面」），仅对
> **内容展示型**站点使用，**不要**对在线编辑器/表单应用默认开启。

## 验证流程（固化任何规则前必做）

不准凭猜测上线选择器。每条规则上线/收窄前，用 research 仓库的探针实测：

```bash
# 在 copy-unlock-research/ 下
node src/site-probe.mjs "https://目标站点/某公开页"
```

它对比「无扩展 vs 加载扩展」，并**读真实剪贴板**作为权威信号（干净 / 含水印 / 被阻止 /
无可选文本）。据此判断属于上表哪种机制，再选最小破坏的动作；能定位到精确容器类名就把
通配选择器收窄，减少副作用。

离线层面，注册表本身有单元测试守护（结构合法、命中正确、**排除站点零命中**、apply 不抛错）：

```bash
node test/site-rules.test.mjs
```

## 当前已登记（起步，⚠️ 待真机验证）

| id | 域 | 动作 | 机制假设 | 状态 |
|---|---|---|---|---|
| `moon-vn` | `moon.vn` | `requestStrong()` | 学习/题库正文动态重加限制 | ⚠️ 待真机收窄 |
| `deviantart` | `deviantart.com` | `addCss(...)` | 类选择器 + `!important` 顶过通配样式 | ⚠️ 待真机收窄 |

> 这两条来自竞品评论点名的失效站点，选了**保守且可一键按站关闭**的动作作为起点。
> 真机实测确认机制后，应把通配选择器收窄到精确容器，或在确属标准模式已覆盖时直接删除。

## 候选清单（评论点名失效，来自 OPPORTUNITIES.md）

待真机逐一验证后决定登记与否：

- **公开内容、可考虑登记**：moon.vn、sat.gob.mx（政府公开页，注意表单交互别用强力）、
  DeviantArt、ChatGPT（自己的会话内容，注意别破坏其交互）。
- **需谨慎（编辑器/应用，强力模式易破坏交互）**：飞书 `feishu.cn` / `larksuite.com`
  编辑器、Teams、Spotify、Google Maps、MSN —— 优先尝试 `addCss`，强力仅按需 opt-in。

## 明确排除（故意不登记 —— 越界）

与 README 的边界一致，下列站点**绝不适配**，因为它们不是「内容本就可见、仅前端挡住复制」：

- **uworld.com / USMLE 题库** —— 付费登录题库
- **bibliu.com** —— 付费电子教材
- **creativefabrica.com（付费下载区）** —— 付费素材

> 单元测试 `test/site-rules.test.mjs` 把这些 host 列为 `FORBIDDEN_HOSTS` 硬断言**零命中**，
> 防止日后误加规则越过边界。
