import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRIVER_ORDER, listCandidateExecutables, findBrowserExecutable,
  probeHeadlessDriver, fetchWithHeadless
} from '../headless.mjs';

test('驱动探测顺序：playwright 系优先，*-core 不捆绑浏览器下载', () => {
  assert.equal(DRIVER_ORDER[0], 'playwright-core');
  assert.ok(DRIVER_ORDER.includes('puppeteer-core'));
});

test('候选可执行文件：显式环境变量永远排最前', () => {
  const list = listCandidateExecutables({ env: { HEADLESS_BROWSER_EXECUTABLE_PATH: '/opt/my/chrome' }, platform: 'linux', home: '/nonexist' });
  assert.equal(list[0], '/opt/my/chrome');
  assert.ok(list.includes('/usr/bin/google-chrome'));
});

test('候选可执行文件：按平台给常见路径，空 env 不产生空串', () => {
  const darwin = listCandidateExecutables({ env: {}, platform: 'darwin', home: '/nonexist' });
  assert.ok(darwin.some(p => p.includes('Google Chrome.app')));
  const win = listCandidateExecutables({ env: {}, platform: 'win32', home: '/nonexist' });
  assert.ok(win.some(p => /chrome\.exe$/i.test(p)));
  const linux = listCandidateExecutables({ env: { LOCALAPPDATA: undefined }, platform: 'linux', home: '/nonexist' });
  assert.ok(linux.every(p => typeof p === 'string' && p.trim() !== ''));
});

test('findBrowserExecutable 挑第一个真实存在的路径，找不到返回空串', () => {
  const exists = p => p === '/usr/bin/chromium';
  assert.equal(findBrowserExecutable({ env: {}, platform: 'linux', home: '/nonexist', exists }), '/usr/bin/chromium');
  assert.equal(findBrowserExecutable({ env: {}, platform: 'linux', home: '/nonexist', exists: () => false }), '');
  // 显式指定的路径优先于系统路径
  const envPick = findBrowserExecutable({ env: { CHROME_PATH: '/x/chrome' }, platform: 'linux', home: '/nonexist', exists: () => true });
  assert.equal(envPick, '/x/chrome');
});

test('探针结果结构稳定：available 为布尔，不可用时 reason 非空', async () => {
  const probe = await probeHeadlessDriver();
  assert.equal(typeof probe.available, 'boolean');
  assert.equal(typeof probe.driver, 'string');
  assert.equal(typeof probe.reason, 'string');
  if (!probe.available) assert.ok(probe.reason.length > 0);
  if (probe.available) { assert.ok(probe.executablePath.length > 0); assert.equal(probe.reason, ''); }
});

test('fetchWithHeadless 任何失败都返回 { ok:false, error }，绝不抛异常', async () => {
  const res = await fetchWithHeadless('https://seekingalpha.com/latest-articles', { timeoutMs: 3000 });
  // 探针不可用（未装浏览器）→ 如实上报；探针可用但网络受限 → 同样如实上报。两种情况都必须 ok===false 且有 error。
  if (res.ok) {
    assert.equal(typeof res.html, 'string');
    assert.ok(res.html.length > 0);
  } else {
    assert.equal(res.ok, false);
    assert.ok(String(res.error || '').length > 0);
  }
});
