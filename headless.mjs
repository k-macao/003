// headless.mjs — 无头浏览器探针（轻量 HTTP 探针 → 无头浏览器渲染读取 的分级降级）
//
// 背景：seekingalpha.com/latest-articles 对机房 IP 常返回 403 / 空页（反爬限流），
//       纯 HTTP 探针读不到正文时，升级为无头浏览器真实渲染再取 DOM。
//
// 网上调研结论（2026）：主流无头浏览器方案为 Playwright 与 Puppeteer ——
//   · playwright-core（微软，Chromium 内核，反检测通过率更高，core 包不捆绑浏览器下载）
//   · puppeteer-core（Google，CDP 直连，core 包同样不下载浏览器）
//   来源见 README「无头浏览器探针」一节。两者均为可选依赖（optionalDependencies），
//   本模块动态探测：装到哪个用哪个，浏览器可执行文件也按环境变量与常见路径逐级探测；
//   探针不可用时如实上报，由上层继续降级（示例数据），绝不静默伪造。
//
// 导出（纯函数为主，可离线自测）：
//   DRIVER_ORDER                 驱动探测顺序（先 playwright 系，后 puppeteer 系）
//   listCandidateExecutables(o)  依据 env / 平台列出候选 Chromium 可执行文件（纯函数）
//   findBrowserExecutable(o)     在候选中挑第一个真实存在且可执行的路径（可注入 exists）
//   probeHeadlessDriver()        驱动 + 可执行文件联合探针 → { available, driver, executablePath, reason }
//   fetchWithHeadless(url, opt)  无头浏览器渲染读取 → { ok, html, driver, executablePath, ms, error }

import fs from 'node:fs';

export const HEADLESS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 驱动探测顺序：调研显示 Playwright 反检测能力更强，优先；两个 *-core 包都不捆绑浏览器下载。
export const DRIVER_ORDER = ['playwright-core', 'playwright', 'puppeteer-core', 'puppeteer'];

const LINUX_PATHS = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/lib/chromium/chromium',
  '/usr/lib/chromium-browser/chromium-browser',
  '/snap/bin/chromium'
];
const DARWIN_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
];
const WIN32_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Chromium\\Application\\chrome.exe'
];

/**
 * 列出候选 Chromium 可执行文件（纯函数，便于离线测试）。
 * 优先级：显式环境变量 > 平台常见路径 > playwright 自带注册表目录（~/.cache/ms-playwright）。
 * @param {{env?: object, platform?: string, home?: string}} o
 */
export function listCandidateExecutables({ env = process.env, platform = process.platform, home = '' } = {}) {
  const out = [];
  const push = p => { const s = String(p || '').trim(); if (s && !out.includes(s)) out.push(s); };
  // 1) 显式指定（运维可直接指到自建浏览器）
  for (const key of ['HEADLESS_BROWSER_EXECUTABLE_PATH', 'CHROME_PATH', 'PUPPETEER_EXECUTABLE_PATH', 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH']) push(env[key]);
  // 2) 平台常见安装位置（GitHub Actions ubuntu-latest 自带 /usr/bin/google-chrome）
  if (platform === 'darwin') DARWIN_PATHS.forEach(push);
  else if (platform === 'win32') WIN32_PATHS.forEach(push);
  else LINUX_PATHS.forEach(push);
  // 3) `npx playwright install chromium` 的默认落点（~/.cache/ms-playwright/chromium*/chrome-linux*/chrome）
  const base = env.PLAYWRIGHT_BROWSERS_PATH || `${home || env.HOME || ''}/.cache/ms-playwright`;
  try {
    for (const dir of fs.readdirSync(base).filter(d => /^chromium(-headless-shell)?-\d+/i.test(d)).sort().reverse()) {
      for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-linux/headless_shell', 'chrome-linux64/headless_shell', 'chrome-win/headless_shell.exe']) {
        push(`${base}/${dir}/${sub}`);
      }
    }
  } catch (_) { /* 目录不存在属正常：继续走其它候选 */ }
  return out;
}

/**
 * 在候选路径中挑第一个真实存在（且非目录）的路径；找不到返回 ''。
 * @param {{env?: object, platform?: string, home?: string, exists?: (p:string)=>boolean}} o
 */
export function findBrowserExecutable({ exists = p => { try { return fs.existsSync(p) && fs.statSync(p).isFile(); } catch { return false; } }, ...rest } = {}) {
  for (const p of listCandidateExecutables({ ...rest })) if (exists(p)) return p;
  return '';
}

// ===================== 驱动探针（动态 import，可选依赖） =====================
let driverProbe = null; // 记忆化：驱动装载结果在进程内不变

async function tryImport(name) {
  try { return await import(name); } catch { return null; }
}

/**
 * 联合探针：无头浏览器驱动是否可用。
 * @returns {Promise<{available:boolean, driver:string, executablePath:string, reason:string}>}
 */
export async function probeHeadlessDriver() {
  if (driverProbe) return driverProbe;
  let driver = '', mod = null;
  for (const name of DRIVER_ORDER) {
    mod = await tryImport(name);
    if (mod) { driver = name; break; }
  }
  if (!mod) {
    driverProbe = { available: false, driver: '', executablePath: '', reason: '未安装无头浏览器驱动（可选依赖 playwright-core / puppeteer-core 缺失）' };
    return driverProbe;
  }
  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    driverProbe = {
      available: false, driver, executablePath: '',
      reason: `驱动 ${driver} 已就绪，但未找到 Chromium/Chrome 可执行文件（可设 HEADLESS_BROWSER_EXECUTABLE_PATH 或 npx playwright install chromium）`
    };
    return driverProbe;
  }
  driverProbe = { available: true, driver, executablePath, reason: '' };
  return driverProbe;
}

// ===================== 无头浏览器渲染读取 =====================
const BLOCKED_RESOURCE_TYPES = new Set(['image', 'font', 'media', 'stylesheet']);

// 轻量反检测补丁：抹掉自动化标记（基础级；更高级的指纹对抗不在本项目目标内，读取公开列表页够用）。
const STEALTH_INIT_JS = "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});";

async function fetchWithPlaywright(mod, driverName, url, { executablePath, timeoutMs, log }) {
  const chromium = mod.chromium;
  if (!chromium) throw Error(`${driverName} 缺少 chromium 入口`);
  const browser = await chromium.launch({
    headless: true,
    timeout: Math.max(5000, timeoutMs - 10000),
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  try {
    const context = await browser.newContext({
      userAgent: HEADLESS_UA,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      viewport: { width: 1366, height: 900 }
    });
    await context.addInitScript(STEALTH_INIT_JS);
    const page = await context.newPage();
    try {
      await page.route('**/*', route => BLOCKED_RESOURCE_TYPES.has(route.request().resourceType())
        ? route.abort()
        : route.continue());
    } catch (_) { /* route 失败不阻断主流程 */ }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.max(5000, timeoutMs - 8000) });
    // 等文章锚点出现；等不到也照样取 DOM（可能结构已变，交由解析器裁决）
    try { await page.waitForSelector('a[href*="/article/"]', { timeout: 6000 }); } catch (_) { /* 忽略 */ }
    const html = await page.content();
    log(`[headless] ${driverName} 渲染完成，DOM ${(html || '').length} 字符`);
    return html;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function fetchWithPuppeteer(mod, driverName, url, { executablePath, timeoutMs, log }) {
  const launch = mod.launch || mod.default?.launch;
  if (!launch) throw Error(`${driverName} 缺少 launch 入口`);
  const browser = await launch({
    headless: true,
    timeout: Math.max(5000, timeoutMs - 10000),
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(HEADLESS_UA);
    await page.setViewport({ width: 1366, height: 900 });
    try { await page.evaluateOnNewDocument(STEALTH_INIT_JS); } catch (_) { /* 忽略 */ }
    try {
      await page.setRequestInterception(true);
      page.on('request', req => BLOCKED_RESOURCE_TYPES.has(req.resourceType()) ? req.abort().catch(() => {}) : req.continue().catch(() => {}));
    } catch (_) { /* 忽略 */ }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.max(5000, timeoutMs - 8000) });
    try { await page.waitForSelector('a[href*="/article/"]', { timeout: 6000 }); } catch (_) { /* 忽略 */ }
    const html = await page.content();
    log(`[headless] ${driverName} 渲染完成，DOM ${(html || '').length} 字符`);
    return html;
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * 无头浏览器探针式读取：真实渲染目标页并返回 DOM。
 * 任何阶段失败都返回 { ok:false, error }，绝不抛给上层、绝不伪造内容。
 * @param {string} url
 * @param {{timeoutMs?: number, log?: (m:string)=>void}} opts
 * @returns {Promise<{ok:boolean, html?:string, driver?:string, executablePath?:string, ms?:number, error?:string}>}
 */
export async function fetchWithHeadless(url, { timeoutMs = 30000, log = () => {} } = {}) {
  const t0 = Date.now();
  const probe = await probeHeadlessDriver();
  if (!probe.available) return { ok: false, error: `无头浏览器探针不可用：${probe.reason}`, driver: probe.driver, ms: Date.now() - t0 };
  const mod = await tryImport(probe.driver);
  if (!mod) return { ok: false, error: `驱动 ${probe.driver} 加载失败`, driver: probe.driver, ms: Date.now() - t0 };
  const opts = { executablePath: probe.executablePath, timeoutMs, log };
  let timer = null;
  try {
    const html = await Promise.race([
      /playwright/.test(probe.driver)
        ? fetchWithPlaywright(mod, probe.driver, url, opts)
        : fetchWithPuppeteer(mod, probe.driver, url, opts),
      new Promise((_, rej) => { timer = setTimeout(() => rej(Error(`无头浏览器整体超时（${Math.round(timeoutMs / 1000)}s）`)), timeoutMs); timer.unref?.(); })
    ]);
    if (!html || html.length < 200) return { ok: false, error: '无头浏览器渲染结果为空页', driver: probe.driver, executablePath: probe.executablePath, ms: Date.now() - t0 };
    return { ok: true, html, driver: probe.driver, executablePath: probe.executablePath, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e.message, driver: probe.driver, executablePath: probe.executablePath, ms: Date.now() - t0 };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
