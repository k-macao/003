// 服务端推送回归：一对多（topic 群组编码，默认 oai.1）、配置接口不泄露 Token、推送标题、无字幕状态文案。
// 启动真实 server.js，用预加载脚本拦截 PushPlus 请求 —— 不联网、不发送任何真实消息。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const TOKEN = 'test-only-token';
const TITLE = '章鱼 AI · 舆情量化分析';

async function startServer(env = {}) {
  const child = spawn(process.execPath, ['--require', './test/fixtures/mock-pushplus.cjs', 'server.js'], {
    cwd: root,
    env: { ...process.env, PORT: '0', PUSHPLUS_TOKEN: '', PUSHPLUS_TOPIC: '', DEEPSEEK_API_KEY: '', OPENAI_API_KEY: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const payloads = [];
  let buffer = '';
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server.js 启动超时')), 10000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`server.js 提前退出：${code}`)); });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      buffer += chunk;
      let i;
      while ((i = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 1);
        if (line.startsWith('PUSHPLUS_MOCK ')) payloads.push(JSON.parse(line.slice('PUSHPLUS_MOCK '.length)));
        const m = line.match(/Octopus AI Panorama on (\d+)/);
        if (m) { clearTimeout(timer); resolve(Number(m[1])); }
      }
    });
  });
  const base = `http://127.0.0.1:${port}`;
  return {
    payloads,
    get: path => fetch(base + path),
    post: (path, body) => fetch(base + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }),
    // stdout 为异步管道：等拦截到的请求体到齐再断言
    async waitPayloads(n) {
      for (let i = 0; i < 100 && payloads.length < n; i++) await new Promise(r => setTimeout(r, 20));
      assert.equal(payloads.length, n);
    },
    stop: () => new Promise(resolve => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      child.kill();
    })
  };
}

const brief = '<div>页眉</div><section>测试简报</section><div>页脚</div>';

test('一对多：服务端 PUSHPLUS_TOPIC 写入 PushPlus 请求；网页群组编码优先', async t => {
  const s = await startServer({ PUSHPLUS_TOKEN: TOKEN, PUSHPLUS_TOPIC: 'team-brief' });
  t.after(() => s.stop());

  const configRes = await s.get('/api/push-config');
  const raw = await configRes.text();
  assert.deepEqual(JSON.parse(raw), { wechatConfigured: true, topic: 'team-brief', mode: 'one-to-many', channel: 'wechat' });
  assert.ok(!raw.includes(TOKEN), '配置接口不得回传 Token');

  const r1 = await s.post('/api/push', { content: brief });
  const d1 = await r1.json();
  assert.equal(r1.status, 200);
  assert.equal(d1.ok, true);
  assert.equal(d1.mode, 'one-to-many');
  assert.equal(d1.topic, 'team-brief');
  assert.ok(!JSON.stringify(d1).includes(TOKEN));
  await s.waitPayloads(1);
  assert.equal(s.payloads[0].topic, 'team-brief');
  assert.equal(s.payloads[0].token, TOKEN);
  assert.equal(s.payloads[0].title, TITLE);
  assert.equal(s.payloads[0].channel, 'wechat');
  assert.equal(s.payloads[0].template, 'html');

  const r2 = await s.post('/api/push', { content: brief, topic: '  web-group  ' });
  assert.equal((await r2.json()).topic, 'web-group');
  await s.waitPayloads(2);
  assert.equal(s.payloads[1].topic, 'web-group');

  // 空白群组编码不覆盖服务端配置
  await s.post('/api/push', { content: brief, topic: '   ' });
  await s.waitPayloads(3);
  assert.equal(s.payloads[2].topic, 'team-brief');
});

test('未配置群组编码时默认一对多发送到群组 oai.1（含空白配置），标题统一', async t => {
  for (const PUSHPLUS_TOPIC of ['', '   ']) {
    const s = await startServer({ PUSHPLUS_TOKEN: TOKEN, PUSHPLUS_TOPIC });
    t.after(() => s.stop());

    const config = await (await s.get('/api/push-config')).json();
    assert.equal(config.topic, 'oai.1');
    assert.equal(config.mode, 'one-to-many');

    const d = await (await s.post('/api/push', { content: brief })).json();
    assert.equal(d.ok, true);
    assert.equal(d.mode, 'one-to-many');
    assert.equal(d.topic, 'oai.1');
    await s.waitPayloads(1);
    assert.equal(s.payloads[0].topic, 'oai.1', JSON.stringify(s.payloads[0]));
    assert.equal(s.payloads[0].title, TITLE);
  }
});

test('示例数据：未读到字幕的条目状态为「仅供参考，不做推荐」', async t => {
  const s = await startServer();
  t.after(() => s.stop());
  const raw = await (await s.get('/api/demo')).text();
  const noCaption = JSON.parse(raw).items.filter(x => !x.transcript);
  assert.ok(noCaption.length > 0);
  assert.ok(noCaption.every(x => x.status === '仅供参考，不做推荐'), JSON.stringify(noCaption.map(x => x.status)));
  assert.ok(!raw.includes('未读取到字幕（仅标题）'));
});
