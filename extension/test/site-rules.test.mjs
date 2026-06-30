/*
 * 站点规则注册表 · 离线单元测试（无需浏览器，可进 CI）
 *
 * 在沙箱里加载 constants.js + site-rules.js（二者都是挂到全局的 IIFE），断言：
 *   - 注册表结构合法：每条规则有唯一 id、match 函数、apply 函数
 *   - 命中正确：match 命中目标域及其子域，且不误命中无关域
 *   - 边界铁律：没有任何规则命中「明确排除」的付费/登录站点
 *   - apply 健壮：用 mock api 跑一遍不抛错，且触发预期的 api 调用
 *
 * 运行：node test/site-rules.test.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, "../src");

// ---- 在沙箱里加载内容脚本（它们用 `typeof self!=="undefined"?self:globalThis` 取全局）----
const sandbox = { console };
vm.createContext(sandbox);
for (const f of ["constants.js", "site-rules.js"]) {
  vm.runInContext(readFileSync(path.join(srcDir, f), "utf8"), sandbox, { filename: f });
}
const CU = sandbox.CU;
const rules = (CU && CU.siteRules) || [];

// ---- 极简断言器 ----
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? "✅" : "❌"} ${name}${detail ? "  — " + detail : ""}`);
};

// 「明确排除」铁律：这些站点任何规则都不得命中（付费/登录墙，越界）
const FORBIDDEN_HOSTS = [
  "uworld.com",
  "www.uworld.com",
  "bibliu.com",
  "app.bibliu.com",
  "www.creativefabrica.com",
];

function anyRuleMatches(host) {
  return rules.some((r) => {
    try {
      return r.match(host, "https://" + host + "/");
    } catch {
      return false;
    }
  });
}

// 1) 结构合法 + id 唯一
{
  const ids = rules.map((r) => r && r.id);
  const allShaped = rules.every(
    (r) =>
      r &&
      typeof r.id === "string" &&
      /^[a-z0-9-]+$/.test(r.id) &&
      typeof r.match === "function" &&
      typeof r.apply === "function"
  );
  const unique = new Set(ids).size === ids.length;
  check("注册表结构合法（id/match/apply 齐全且 id 合规）", Array.isArray(rules) && allShaped, `ids=${JSON.stringify(ids)}`);
  check("规则 id 唯一", unique, `count=${ids.length}`);
}

// 2) 命中正确：目标域 + 子域命中，无关/伪装域不命中
{
  check("moon.vn 命中自身与子域", anyRuleMatches("moon.vn") && anyRuleMatches("hoc.moon.vn"));
  check("moon.vn 不误命中伪装域", !anyRuleMatches("moon.vn.evil.com") && !anyRuleMatches("notmoon.vn"));
  check("deviantart.com 命中自身与子域", anyRuleMatches("deviantart.com") && anyRuleMatches("www.deviantart.com"));
  check("无关域不命中任何规则", !anyRuleMatches("example.com") && !anyRuleMatches("github.com"));
}

// 3) 边界铁律：排除站点零命中
{
  const hit = FORBIDDEN_HOSTS.filter(anyRuleMatches);
  check("付费/登录墙站点零命中（边界铁律）", hit.length === 0, hit.length ? "命中了: " + hit.join(", ") : "");
}

// 4) apply 健壮：mock api 跑一遍不抛错，且触发预期调用
{
  let threw = null;
  const seen = []; // 记录每条规则触发了哪些 api
  for (const r of rules) {
    const calls = { addCss: 0, requestStrong: 0 };
    const api = {
      host: "test.local",
      url: "https://test.local/",
      addCss: (css) => {
        if (typeof css !== "string" || !css.trim()) threw = `${r.id}: addCss 收到空/非字符串`;
        calls.addCss++;
      },
      requestStrong: () => calls.requestStrong++,
      log: () => {},
    };
    try {
      r.apply(api);
    } catch (e) {
      threw = `${r.id}: ${e && e.message}`;
    }
    seen.push({ id: r.id, ...calls });
  }
  check("所有 apply 用 mock api 运行无异常", threw === null, threw || "");
  // 起步规则的预期动作（随规则演进可调整）
  const moon = seen.find((s) => s.id === "moon-vn");
  const da = seen.find((s) => s.id === "deviantart");
  check("moon-vn 触发 requestStrong", !!moon && moon.requestStrong === 1);
  check("deviantart 触发 addCss", !!da && da.addCss === 1);
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== ${passed}/${results.length} 通过 ===`);
process.exit(passed === results.length ? 0 : 1);
