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
function harness({ token = '', topic = '', configured = false, serverTopic = 'oai.1', configFails = false, auto = true, items = [item()], pushFails = false, scanFails = false, holdPush } = {}) {
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
  node('#topic').value = topic;
  node('#auto-push-wechat').checked = auto;
  const calls = [], alerts = [];
  const context = vm.createContext({
    document: { querySelector: node }, console, AbortSignal,
    alert: message => alerts.push(message), confirm: () => false,
    setTimeout: fn => { fn(); return 0; },
    fetch: async (url, options) => {
      calls.push({ url, body: options?.body ? JSON.parse(options.body) : null });
      let data = {};
      if (url === '/api/push-config') {
        if (configFails) throw new Error('config offline');
        data = { wechatConfigured: configured, topic: serverTopic, mode: 'one-to-many', channel: 'wechat' };
      }
      else if (url === '/api/scan') {
        if (scanFails) throw new Error('scan offline');
        data = { items, hiddenCount: 0 };
      } else if (url === '/api/demo') data = { items: [item()], demo: true };
      else if (url === '/api/summarize') data = { ok: false };
      else if (url.startsWith('/api/seekingalpha')) data = { ok: true, items: [], html: '' };
      else if (url === '/api/push') {
        if (holdPush) await holdPush;
        // 模拟服务端：群组编码 = 请求体 topic → 服务端 PUSHPLUS_TOPIC → 默认 oai.1，始终一对多
        const used = calls.at(-1).body.topic || serverTopic || 'oai.1';
        data = pushFails ? { ok: false, msg: 'send rejected' } : { ok: true, sentParts: 1, totalParts: 1, mode: 'one-to-many', topic: used };
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

test('一对多：填写群组编码后推送请求携带 topic，MODE 显示一对多', async () => {
  assert.match(index, /<input id="topic"[^>]*type="text"/);
  assert.match(index, /id="pushMode"/);
  const h = harness({ token: 'test-only', topic: ' team-brief ' });
  await h.node('#scan').onclick();
  assert.equal(h.pushes().length, 1);
  assert.equal(h.pushes()[0].body.topic, 'team-brief');
  assert.equal(h.pushes()[0].body.channel, 'wechat');
  assert.match(h.node('#pushMode').textContent, /一对多 · 群组 team-brief/);
  assert.match(h.node('#pushStatus').textContent, /PUSHED 1\/1 · 一对多 · team-brief/);
});

test('一对多默认群组 oai.1：网页留空时交给服务端，MODE 与状态显示实际群组', async () => {
  assert.match(index, /id="pushMode">一对多 · 群组 oai\.1</);
  assert.match(index, /<input id="topic"[^>]*placeholder="留空 = 默认群组 oai\.1/);
  const h = harness({ configured: true });
  await h.node('#scan').onclick();
  assert.equal(h.pushes().length, 1);
  const body = h.pushes()[0].body;
  assert.equal(body.topic, '');
  assert.ok(!('title' in body), '推送标题由服务端统一');
  assert.equal(h.node('#pushMode').textContent, '一对多 · 群组 oai.1');
  assert.match(h.node('#topic').placeholder, /默认群组 oai\.1/);
  assert.match(h.node('#pushStatus').textContent, /PUSHED 1\/1 · 一对多 · oai\.1/);
  assert.ok(!/一对一/.test(h.node('#pushMode').textContent + h.node('#pushStatus').textContent));
});

test('服务端改用其它群组时 MODE 跟随；配置接口不可用时仍按一对多交给服务端', async () => {
  const h1 = harness({ configured: true, serverTopic: 'team-env' });
  await h1.node('#scan').onclick();
  assert.equal(h1.pushes()[0].body.topic, '');
  assert.equal(h1.node('#pushMode').textContent, '一对多 · 群组 team-env');
  assert.match(h1.node('#pushStatus').textContent, /一对多 · team-env/);

  const h2 = harness({ token: 'test-only', configFails: true });
  await h2.node('#scan').onclick();
  assert.equal(h2.pushes().length, 1);
  assert.equal(h2.pushes()[0].body.topic, '');
  assert.equal(h2.node('#pushMode').textContent, '一对多 · 默认群组');
  assert.match(h2.node('#pushStatus').textContent, /PUSHED 1\/1 · 一对多 · oai\.1/);
});

test('工作流手动与定时推送都按一对多发送（默认群组 oai.1），标题统一，镜像一致', async () => {
  const workflow = await readFile(new URL('../.github/workflows/oai.yml', import.meta.url), 'utf8');
  assert.match(workflow, /^env:\n  NODE_VERSION: 20\n(?:  #[^\n]*\n)?  PUSHPLUS_DEFAULT_TOPIC: 'oai\.1'$/m);
  assert.match(workflow, /pushplus_topic:\s+description:[^\n]+\s+required: false\s+default: ''/);
  assert.match(workflow, /PUSHPLUS_TOPIC: \$\{\{ inputs\.pushplus_topic != '' && inputs\.pushplus_topic \|\| secrets\.PUSHPLUS_TOPIC \}\}/);
  assert.match(workflow, /PUSHPLUS_TOPIC: \$\{\{ secrets\.PUSHPLUS_TOPIC \}\}/);
  assert.equal(workflow.match(/const topic = String\(process\.env\.PUSHPLUS_TOPIC \|\| ''\)\.trim\(\) \|\| String\(process\.env\.PUSHPLUS_DEFAULT_TOPIC \|\| ''\)\.trim\(\);/g)?.length, 2);
  assert.equal(workflow.match(/channel: 'wechat', topic \}\);/g)?.length, 2);
  assert.equal(workflow.match(/const title = '章鱼 AI · 舆情量化分析';/g)?.length, 2);
  assert.ok(!/一对一|章鱼 AI 全景分析/.test(workflow));
  assert.equal(workflow, await readFile(new URL('../ci.yml.new', import.meta.url), 'utf8'));
});

test('每条 AI 多空概率一行显示：网页与手动推送都不附模型 / 免责 / 未读正文说明', async () => {
  const items = [
    { ...item(), bullBear: { bull: 62, bear: 38, note: '偏多：反弹', source: 'ai' } },
    { ...item(), title: '无字幕条目', transcript: '', status: '仅供参考，不做推荐',
      bullBear: { bull: 47, bear: 53, note: '中性：未出现明确方向信号（仅标题）', source: 'rule' } }
  ];
  const h = harness({ token: 'test-only', items });
  await h.node('#scan').onclick();

  const web = h.node('#results').innerHTML;
  const webLines = web.match(/<div class="longshort">[\s\S]*?<\/div>/g) || [];
  assert.equal(webLines.length, 2);
  assert.match(webLines[0], /<span class="ls-badge">AI 多空概率<\/span>\s*<span class="ls-v bull">多 62%<\/span>\s*<span class="ls-bar"><b>██████<\/b>░░░░<\/span>\s*<span class="ls-v bear">空 38%<\/span>/);
  // 本地规则兜底不冒充 AI
  assert.match(webLines[1], /<span class="ls-badge">规则多空概率<\/span>[\s\S]*多 47%[\s\S]*<b>█████<\/b>░░░░░[\s\S]*空 53%/);

  const push = h.pushes()[0].body.content;
  const pushLines = push.match(/<div style="margin-top:6px;padding:3\.75px 6px;[^"]*white-space:nowrap;[^"]*">.*?<\/div>/g) || [];
  assert.equal(pushLines.length, 2);
  assert.equal(pushLines[0].replace(/<[^>]+>/g, ''), 'AI 多空概率 多 62% ██████░░░░ 空 38%');
  assert.equal(pushLines[1].replace(/<[^>]+>/g, ''), '规则多空概率 多 47% █████░░░░░ 空 53%');
  assert.match(push, /仅供参考，不做推荐/); // 无字幕状态徽章仍在
  for (const html of [web, push]) {
    assert.ok(!/模型：|仅供研究参考，不构成投资建议|未读取视频正文|概率仅依据标题与频道推算|仅标题/.test(html), html);
  }
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.item \.longshort\s*\{[^}]*display: flex;[^}]*white-space: nowrap;/);
  assert.ok(!/ls-row|ls-head/.test(css + source));
});

test('SA 推送卡片与定时推送模板：每条 AI 多空概率一行，不附模型 / 免责说明', async () => {
  const { renderSeekingAlphaPush, buildDemoSeekingAlpha } = await import('../seekingalpha.mjs');
  const { items } = buildDemoSeekingAlpha();
  items[1].bullBear = { ...items[1].bullBear, source: 'rule' };
  const cards = renderSeekingAlphaPush(items).split('<section').filter(c => c.includes('SA#'));
  assert.equal(cards.length, items.filter(x => !x.error).length);
  for (const card of cards) {
    assert.equal(card.match(/white-space:nowrap;overflow:hidden;text-overflow:ellipsis;/g)?.length, 1);
    assert.ok(!/模型：|仅供研究参考|未读取视频正文/.test(card), card);
  }
  assert.match(cards[0], />AI 多空概率<\/span> 多 \d+% █*<span style="color:#3f8f5b;">░*<\/span> 空 \d+%<\/div>/);
  assert.match(cards[1], />规则多空概率<\/span>/);
  const workflow = await readFile(new URL('../.github/workflows/oai.yml', import.meta.url), 'utf8');
  assert.ok(!/未读取视频正文|仅供研究参考，不构成投资建议\$\{/.test(workflow));
  assert.equal(workflow.match(/const lsBlock = x => \{/g)?.length, 2);
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
