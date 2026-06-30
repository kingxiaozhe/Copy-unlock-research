# 隐私政策 · Privacy Policy

**复制解锁 · Copy Unlock**

最后更新：2026-06-30

## 简短版

本扩展**不收集、不存储、不传输任何个人数据**，**不进行任何网络请求**，**无追踪、无分析、无广告**。所有设置仅保存在你本机。

## 数据收集

本扩展**不收集任何用户数据**，包括但不限于：

- 不收集个人身份信息（姓名、邮箱、地址等）
- 不收集浏览历史、网址、页面内容
- 不收集使用统计 / 分析数据
- 不使用 Cookie、不使用任何第三方分析或广告 SDK

## 数据存储

扩展仅在你的浏览器本机通过 `chrome.storage.local` 保存少量**偏好设置**：

- 每个网站的「启用 / 关闭」状态
- 「本站始终强力」网站名单
- 「划词浮窗复制」开关

这些数据**只存在于你的设备上**，不会上传、不会同步到任何服务器，卸载扩展即随之删除。

## 网络

本扩展**不发起任何网络请求**：没有 `fetch` / `XMLHttpRequest` / `sendBeacon` / `WebSocket`，没有任何站外 URL，没有远程代码。可在源码中自行核验：

```bash
grep -rniE "fetch\(|XMLHttpRequest|sendBeacon|WebSocket|analytics|eval\(" src popup.js
```

## 权限用途

| 权限 | 用途 |
|---|---|
| `storage` | 在本机保存上述偏好设置 |
| `activeTab` | 用户点击图标时操作当前标签页 |
| `scripting` | 注入解锁脚本（强力模式 / 按需解锁本页） |
| `<all_urls>` | 「页面加载即自动解锁」需在所有网站注入内容脚本 |

所有权限仅服务于「解除网页前端禁复制」这一单一用途。

## 边界

本扩展只处理「内容你本就能看到、仅被前端 JS/CSS 挡住复制」的情况，**不绕过任何付费墙 / 登录权限 / DRM**，**不抓取你无权访问的内容**。

## 开源

本扩展开源，代码可完整审阅：<https://github.com/kingxiaozhe/copy-unlock>

## 联系

如有疑问，请通过项目 Issues 反馈：<https://github.com/kingxiaozhe/copy-unlock/issues>

---

## English (summary)

**Copy Unlock** collects **no data**, makes **no network requests**, and contains **no tracking, analytics, or ads**. It stores only your local preferences (per-site enable/disable, "always strong" list, selection-bar toggle) via `chrome.storage.local`, which never leaves your device. Permissions (`storage`, `activeTab`, `scripting`, `<all_urls>`) serve solely the single purpose of removing front-end copy/select/right-click restrictions on pages you can already view. It does not bypass paywalls, logins, or DRM. Source: https://github.com/kingxiaozhe/copy-unlock
