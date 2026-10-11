import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createReadThrottle } from '../read-throttle.mjs';
import * as freshness from '../freshness.mjs';
import * as longshort from '../longshort.mjs';
import * as seekingalpha from '../seekingalpha.mjs';

const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
const reply = body => ({ ok: true, status: 200, text: async () => body });
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

// 执行真实服务端扫描函数，仅替换网络、计时与 HTTP 监听，绝不访问外站或发送推送。
// VM 中导入的纯解析函数和读取限速器仍使用生产实现，兼容 CI 的 Node 18 / 20。
function harness({ videoPublished = '3 小时前', saPublished = '3 hours ago',
  watchHtml = '<html></html>', searchFails = () => false, sleepImpl } = {}) {
  const sleeps = [], logs = [], calls = [], events = [], captions = [];
  let nextId = 0, reads = 0;
  const searchHtml = () => JSON.stringify(Array.from({ length: 6 }, () => ({
    videoId: String(++nextId).padStart(11, '0'),
    title: { runs: [{ text: '市场测试新闻上涨' }] },
    publishedTimeText: { simpleText: videoPublished }
  }))) + ' '.repeat(2500);
  const saHtml = Array.from({ length: 12 }, (_, i) =>
    `<a href="/article/${1000 + i}-market-outlook"><h3>Market outlook number ${i}</h3></a><time>${saPublished}</time>`).join('\n');
  const context = vm.createContext({
    ...freshness, ...longshort, ...seekingalpha,
    process: { env: {} }, URL, AbortController,
    console: { log: (...args) => logs.push(args.join(' ')) },
    http: { createServer: () => ({ listen() {} }) },
    // 请求超时不触发，原有短间隔直接让出微任务；批次冷却用单独的 sleepImpl 观察。
    setTimeout: (fn, ms) => { if (ms < 1000) queueMicrotask(fn); return 0; },
    clearTimeout() {},
    createReadThrottle: options => {
      const throttle = createReadThrottle({ ...options, sleepImpl: async ms => {
        sleeps.push(ms);
        events.push(`pause:${reads}`);
        if (sleepImpl) await sleepImpl(ms);
      } });
      return {
        read: task => throttle.read(async () => { events.push(`read:${++reads}`); return task(); }),
        prepare: task => throttle.prepare(task)
      };
    },
    readCaptions: async id => {
      captions.push(id);
      return { text: '', code: 'unavailable', status: '仅供参考，不做推荐', attempts: [] };
    },
    analyzeLongShort: async items => items.map(longshort.ruleLongShort),
    fetch: async url => {
      calls.push(url);
      const u = new URL(url);
      if (u.pathname === '/results') {
        if (searchFails(u.searchParams.get('search_query'))) throw new Error('offline');
        return reply(searchHtml());
      }
      if (u.pathname === '/watch') return reply(watchHtml);
      if (url === seekingalpha.SA_URL) return reply(saHtml);
      throw new Error(`Unexpected URL: ${url}`);
    }
  });
  vm.runInContext(source.replace(/^import\s[\s\S]*?;\n/gm, ''), context);
  return { sleeps, logs, calls, events, captions, reads: () => reads,
    run: script => vm.runInContext(script, context) };
}

test('服务端分批扫描累计计数，恰好第 10 / 20 条也暂停，剩余额度保持生效', async () => {
  const h = harness();
  assert.equal((await h.run('scan(["频道1", "频道2", "频道3"])')).items.length, 9);
  assert.deepEqual(h.sleeps, []);
  assert.equal((await h.run('scan(["频道4"], 1)')).items.length, 1);
  assert.equal(h.reads(), 10);
  assert.deepEqual(h.sleeps, [10000]);
  assert.equal((await h.run('scan(["频道5", "频道6", "频道7"])')).items.length, 9);
  assert.deepEqual(h.sleeps, [10000]);
  assert.equal((await h.run('scan(["频道8"], 1)')).items.length, 1);
  assert.equal(h.reads(), 20);
  assert.deepEqual(h.sleeps, [10000, 10000]);
  assert.deepEqual(h.logs.filter(m => m.startsWith('[read-throttle]')), [
    '[read-throttle] 已处理 10 条数据，暂停 10 秒后继续',
    '[read-throttle] 已处理 20 条数据，暂停 10 秒后继续'
  ]);
});

test('视频与 Seeking Alpha 共用同一个计数和冷却周期', async () => {
  const h = harness();
  await h.run('scan(["频道1", "频道2", "频道3"])');
  const sa = await h.run('scanSeekingAlpha()');
  assert.equal(sa.items.length, 12);
  assert.equal(sa.hidden.length, 0);
  assert.equal(h.reads(), 21);
  assert.deepEqual(h.sleeps, [10000, 10000]);
  assert.deepEqual(h.events.filter(e => e.startsWith('pause:')), ['pause:10', 'pause:20']);
});

test('超时 / 无法验证 / 复核预算耗尽的视频仍计数，不依赖最终简报条数', async () => {
  for (const videoPublished of ['4 天前', '']) {
    const h = harness({ videoPublished });
    const out = await h.run('scan(["频道1", "频道2"])');
    assert.equal(out.items.length, 0);
    assert.equal(out.hidden.length, 12);
    assert.equal(h.reads(), 12);
    assert.equal(h.captions.length, 0);
    assert.deepEqual(h.sleeps, [10000]);
    assert.equal(h.calls.filter(u => new URL(u).pathname === '/watch').length, videoPublished ? 0 : 8);
  }
});

test('隐藏的 SA 文章也限速，不会在无新文章时跳过暂停', async () => {
  for (const saPublished of ['4 days ago', '']) {
    const h = harness({ saPublished });
    const out = await h.run('scanSeekingAlpha()');
    assert.equal(out.items.length, 0);
    assert.equal(out.hidden.length, 12);
    assert.equal(h.reads(), 12);
    assert.deepEqual(h.sleeps, [10000]);
  }
});

test('全失败的频道搜索也会暂停，随后正常扫描仍能继续', async () => {
  const h = harness({ searchFails: query => query.includes('异常') });
  const out = await h.run('scan(Array.from({ length: 10 }, (_, i) => "异常频道" + i))');
  assert.equal(out.items.length, 10);
  assert.ok(out.items.every(it => it.error.includes('offline')));
  assert.deepEqual(h.sleeps, [10000]);
  assert.equal((await h.run('scan(["正常频道"], 1)')).items.length, 1);
  assert.deepEqual(h.sleeps, [10000]);
});

test('并发扫描不得在冷却期间发出新的搜索，离线示例等其它功能不阻塞', async () => {
  const sleeping = deferred(), release = deferred();
  const h = harness({ sleepImpl: async () => { sleeping.resolve(); await release.promise; } });
  await h.run('scan(["频道1", "频道2", "频道3"])');
  const tenth = h.run('scan(["频道4"], 1)');
  await sleeping.promise;
  const callsBefore = h.calls.length;
  const next = h.run('scan(["频道5"], 1)');
  await Promise.resolve();
  assert.equal(h.calls.length, callsBefore);
  assert.equal(h.reads(), 10);
  assert.equal(h.run('buildDemoItems()').items.length, 3);
  release.resolve();
  assert.equal((await tenth).items.length, 1);
  assert.equal((await next).items.length, 1);
  assert.equal(h.reads(), 11);
  assert.equal(h.calls.length, callsBefore + 1);
  assert.deepEqual(h.sleeps, [10000]);
});
