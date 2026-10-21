import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const item = () => ({ channel: 'Test', title: '市场新闻', url: 'https://example.com/video',
  publishedAt: new Date().toISOString(), transcript: '00:00 测试正文', status: '字幕已读取' });

// Run the real browser event handlers with a minimal DOM and isolated network.
// Never contact PushPlus or use real tokens in tests.
function harness({ token = '', configured = false, auto = true, items = [item()], pushFails = false, scanFails = false, holdPush } = {}) {
  const nodes = new Map();
  const selected = [{ value: 'Test', checked: true }];
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      style: {}, value: '', checked: false, disabled: false, innerHTML: '', textContent: '',
      addEventListener() {}, querySelectorAll() { return selected; }
    });
    return nodes.get(selector);
  };
  node('#token').value = token;
  node('#auto-push-wechat').checked = auto;
  const calls = [], alerts = [];
  const context = vm.createContext({
    document: { querySelector: node }, console, AbortSignal,
    alert: message => alerts.push(message), confirm: () => false,
    setTimeout: fn => { fn(); return 0; },
    fetch: async (url, options) => {
      calls.push({ url, body: options?.body ? JSON.parse(options.body) : null });
      let data = {};
      if (url === '/api/push-config') data = { wechatConfigured: configured };
      else if (url === '/api/scan') {
        if (scanFails) throw new Error('scan offline');
        data = { items, hiddenCount: 0 };
      } else if (url === '/api/demo') data = { items: [item()], demo: true };
      else if (url === '/api/summarize') data = { ok: false };
      else if (url.startsWith('/api/seekingalpha')) data = { ok: true, items: [], html: '' };
      else if (url === '/api/push') {
        if (holdPush) await holdPush;
        data = pushFails ? { ok: false, msg: 'send rejected' } : { ok: true, sentParts: 1, totalParts: 1 };
      } else throw new Error('Unexpected URL ' + url);
      return { ok: true, json: async () => data };
    }
  });
  vm.runInContext(source, context);
  return { node, calls, alerts, run: script => vm.runInContext(script, context),
    pushes: () => calls.filter(c => c.url === '/api/push') };
}

test('网页和工作流默认勾选微信；工作流镜像一致', async () => {
  assert.match(index, /id="auto-push-wechat"[^>]*checked/);
  const workflow = await readFile(new URL('../.github/workflows/oai.yml', import.meta.url), 'utf8');
  assert.match(workflow, /push_to_wechat:\s+description:[^\n]+\s+required: false\s+default: true/);
  assert.equal(workflow, await readFile(new URL('../ci.yml.new', import.meta.url), 'utf8'));
});

test('已移除废弃频道且默认工作流与网页清单同步', async () => {
  const sourceMatch = source.match(/const sourceNames=`([\s\S]*?)`\.split\('\|'\);/);
  assert.ok(sourceMatch, 'app.js should declare its source list');
  const names = sourceMatch[1].split('|');
  assert.ok(!names.includes('CK财经频道'));
  assert.ok(!names.includes('Mr.Market市场先生'));
  assert.ok(!names.includes('SHIN LI'));
  assert.equal(names.length, 223);
  assert.equal(names[153], 'Bloomberg Television');
  assert.match(source, /const ENGLISH_SOURCE_START = 153;/);

  const workflow = await readFile(new URL('../.github/workflows/oai.yml', import.meta.url), 'utf8');
  assert.ok(!workflow.includes('CK财经频道'));
  assert.ok(!workflow.includes('Mr.Market市场先生'));
  assert.ok(!workflow.includes('SHIN LI'));
  const defaults = [...workflow.matchAll(/(?:ALL_CHANNELS|CHANNELS_JSON)='([^']+)'/g)];
  assert.equal(defaults.length, 2);
  for (const [, json] of defaults) {
    const channels = JSON.parse(json);
    assert.equal(channels.length, 153);
    assert.ok(!channels.includes('CK财经频道'));
    assert.ok(!channels.includes('Mr.Market市场先生'));
  }
});

test('工作流：一对一推送、新标题、10 万字符控制、每条不带模型/免责说明', async () => {
  const workflow = await readFile(new URL('../.github/workflows/oai.yml', import.meta.url), 'utf8');
  // 一对一推送：不读取群组配置，不发送 topic
  assert.ok(!workflow.includes('PUSHPLUS_TOPIC'));
  assert.ok(!/\btopic\s*[,}:]/.test(workflow));
  assert.equal(workflow.match(/template: 'html', channel: 'wechat' \}/g).length, 2);
  // 推送标题
  assert.equal(workflow.match(/const title = '章鱼 AI · 舆情003';/g).length, 2);
  assert.ok(!workflow.includes('章鱼 AI 全景分析'));
  // 10 万文字控制（按字符数，不再按 90,000 字节）
  assert.equal(workflow.match(/const PUSHPLUS_MAX_CHARS = 100000;/g).length, 2);
  assert.ok(!workflow.includes('90000'));
  assert.ok(!workflow.includes('Buffer.byteLength'));
  // 每条卡片：单行多空概率，且不附模型/免责/未读取正文说明
  assert.equal(workflow.match(/多 \$\{lsBar\(bb\.bull\)\} \$\{bb\.bull\}% ｜ 空 \$\{lsBar\(bb\.bear\)\} \$\{bb\.bear\}%/g).length, 2);
  assert.ok(!workflow.includes('仅供研究参考，不构成投资建议'));
  assert.ok(!workflow.includes('未读取视频正文'));
  assert.ok(!workflow.includes('模型：${src}'));
});

test('每条推送：标题、单行多空概率，且不附模型/免责/未读取正文说明', async () => {
  const h = harness({ token: 'test-only', items: [{ ...item(), transcript: '', status: '仅供参考，不做推荐',
    bullBear: { bull: 64, bear: 36, note: '偏多：反弹 / 內房', source: 'ai' } }] });
  await h.node('#scan').onclick();
  const payload = h.pushes()[0].body;
  assert.equal(payload.title, '章鱼 AI · 舆情003');
  // 多 / 空 同一行显示
  assert.match(payload.content, /多 █+░* 64% ｜ 空 █+░* 36%/);
  assert.ok(!/white-space:pre-wrap;">多 /.test(payload.content));
  // 仅保留方向短注，不再附模型与免责说明
  assert.match(payload.content, /偏多：反弹 \/ 內房/);
  assert.ok(!payload.content.includes('模型：DeepSeek 多空推理'));
  assert.ok(!payload.content.includes('仅供研究参考，不构成投资建议'));
  assert.ok(!payload.content.includes('未读取视频正文'));
  // 无字幕条目的状态文字
  assert.match(payload.content, /仅供参考，不做推荐/);
});

test('成功扫描默认只推送一次到微信，使用紧凑内联字号', async () => {
  const h = harness({ token: 'test-only' });
  await h.node('#scan').onclick();
  assert.equal(h.pushes().length, 1);
  const payload = h.pushes()[0].body;
  assert.equal(payload.channel, 'wechat');
  assert.equal(payload.template, 'html');
  assert.match(payload.content, /font-size:11.5px/);
  assert.match(payload.content, /font-size:9.5px;line-height:1.55/);
  assert.equal(h.alerts.length, 0);
  assert.match(h.node('#pushStatus').textContent, /PUSHED/);
  assert.equal(h.node('#scan').disabled, false);
});

test('服务端已配置 Token 时浏览器可以留空，且不读取密钥', async () => {
  const h = harness({ configured: true });
  await h.node('#scan').onclick();
  assert.equal(h.pushes().length, 1);
  assert.equal(h.pushes()[0].body.token, '');
});

test('取消自动推送只扫描，手动按钮仍可发送', async () => {
  const h = harness({ auto: false, token: 'test-only' });
  await h.node('#scan').onclick();
  assert.equal(h.pushes().length, 0);
  await h.node('#push').onclick();
  assert.equal(h.pushes().length, 1);
});

test('未配置 Token 不发送，也不提前请求总结', async () => {
  const h = harness();
  await h.node('#scan').onclick();
  assert.equal(h.pushes().length, 0);
  assert.ok(!h.calls.some(c => c.url === '/api/summarize'));
  assert.match(h.node('#pushStatus').textContent, /微信待配置/);
  assert.equal(h.node('#scan').disabled, false);
});

test('空结果、仅错误、过期内容、扫描失败均不自动发送', async () => {
  for (const options of [
    { items: [] }, { items: [{ channel: 'Test', error: 'offline' }] },
    { items: [{ ...item(), publishedAt: '2020-01-01' }] }, { scanFails: true }
  ]) {
    const h = harness({ ...options, token: 'test-only' });
    await h.node('#scan').onclick();
    assert.equal(h.pushes().length, 0);
    assert.equal(h.node('#push').disabled, true);
  }
});

test('示例数据不自动发送；手动示例确认取消也不发送', async () => {
  const h = harness({ token: 'test-only' });
  await h.node('#demo').onclick();
  assert.equal(h.pushes().length, 0);
  await h.run('pushCurrentReport({ automatic: true })');
  await h.node('#push').onclick();
  assert.equal(h.pushes().length, 0);
});

test('发送失败可手动重试，不自动重复发送', async () => {
  const h = harness({ token: 'test-only', pushFails: true });
  await h.node('#scan').onclick();
  assert.equal(h.pushes().length, 1);
  assert.match(h.node('#pushStatus').textContent, /send rejected/);
  assert.equal(h.node('#push').disabled, false);
  assert.equal(h.node('#scan').disabled, false);
});

test('发送中禁止重复推送和新扫描', async () => {
  let release;
  const holdPush = new Promise(resolve => { release = resolve; });
  const h = harness({ token: 'test-only', holdPush });
  const first = h.node('#scan').onclick();
  // Flush the short chain of mocked async requests until send is in flight.
  for (let i = 0; i < 50 && !h.pushes().length; i++) await Promise.resolve();
  assert.equal(h.pushes().length, 1);
  assert.equal(h.node('#push').disabled, true);
  await h.node('#push').onclick();
  await h.node('#scan').onclick();
  assert.equal(h.pushes().length, 1);
  release();
  await first;
});

test('网页字号、行距、卡片留白均已收紧', async () => {
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /body\s*\{[^}]*font-size: 10px;\s+line-height: 1.45;/);
  assert.match(css, /\.section-panel\s*\{[^}]*padding: 9px;\s+margin-bottom: 10.5px;/);
  assert.match(css, /\.item h3\s*\{[^}]*font-size: 11.5px;/);
});

test('AI、SA、微信预览、手动和定时推送模板没有遗留大字号', async () => {
  for (const name of ['ai.mjs', 'seekingalpha.mjs', 'app.js', 'push.preview.html', '.github/workflows/oai.yml']) {
    const content = await readFile(new URL('../' + name, import.meta.url), 'utf8');
    const sizes = [...content.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1]));
    assert.ok(sizes.length > 0, name);
    assert.ok(sizes.every(size => size >= 7 && size <= 11.5), name);
  }
});

test('推送开头包含 AI 量化舆情分析总结概括，且每条标题展示五档情绪打标', async () => {
  const h = harness({
    token: 'test-only',
    items: [
      {
        channel: '信報財經新聞',
        title: '大盘走势：港股午後跌幅收窄 恒指重上18000點 內房板塊反彈',
        url: 'https://youtu.be/test001',
        published: '2 小时前',
        publishedAt: new Date().toISOString(),
        viewsText: '4.8万次观看',
        views: 48000,
        subscribersText: '32万粉丝',
        subscribers: 320000,
        status: '中文字幕',
        bullBear: { bull: 68, bear: 32, sentiment: '谨慎乐观', weightPct: 72, note: '偏多：反弹 / 恒指' }
      },
      {
        channel: 'Bloomberg Television',
        title: '股票分析：港股/美股科技股領漲 標普500創新高',
        url: 'https://youtu.be/test002',
        published: '1 小时前',
        publishedAt: new Date().toISOString(),
        viewsText: '9.5万次观看',
        views: 95000,
        subscribersText: '120万粉丝',
        subscribers: 1200000,
        status: '自动字幕→中文',
        bullBear: { bull: 78, bear: 22, sentiment: '极度乐观', weightPct: 28, note: '偏多：创新高 / 领涨' }
      }
    ]
  });
  await h.node('#scan').onclick();
  assert.match(h.node('#results').innerHTML, /QUANT_WORKFLOW\.EXE/);
  assert.match(h.node('#results').innerHTML, /AI 多空概率 · 谨慎乐观/);
  assert.match(h.node('#results').innerHTML, /AI 多空概率 · 极度乐观/);
  const pushes = h.pushes();
  assert.equal(pushes.length, 1);
  const content = pushes[0].body.content;
  // 推送开头为 AI 总结概括 + 四步量化舆情分析（排在视频情报流 #1 之前）
  const summaryIdx = content.indexOf('C:\\AI\\SUMMARY.EXE');
  const cardIdx = content.indexOf('DIR ▸ 信報財經新聞');
  assert.ok(summaryIdx >= 0 && cardIdx > summaryIdx, '推送开头应先输出 AI 总结概括再输出每条视频');
  assert.match(content, /QUANT_WORKFLOW\.DAT/);
  assert.match(content, /1\. 数据采集（采集标题）/);
  assert.match(content, /2\. 文本与情绪打标/);
  assert.match(content, /3\. 加权计算“情绪指数”/);
  assert.match(content, /4\. 绘制情绪曲线对照股价/);
  assert.match(content, /AI 多空概率 · 谨慎乐观/);
  assert.match(content, /AI 多空概率 · 极度乐观/);
});

