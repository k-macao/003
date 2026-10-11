// 工作流推送脚本回归：从 .github/workflows/oai.yml 抽出手动 / 定时两段推送脚本，
// 用假扫描结果 + PushPlus 拦截预加载真实执行 —— 不联网、不发送任何真实消息、不使用真实 Token。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const workflow = await readFile(new URL('../.github/workflows/oai.yml', import.meta.url), 'utf8');
const mock = fileURLToPath(new URL('./fixtures/mock-pushplus.cjs', import.meta.url));
// 工作流级 env（GitHub 会注入到每个步骤）
const defaultTopic = workflow.match(/^ {2}PUSHPLUS_DEFAULT_TOPIC: '([^']+)'$/m)?.[1];

// 抽出 `node --input-type=module << 'NODE'` … `NODE` 之间的脚本，并去掉 YAML 块缩进
function pushScripts() {
  return [...workflow.matchAll(/<< 'NODE'\n([\s\S]*?)\n *NODE\n/g)].map(m => {
    const lines = m[1].split('\n');
    const indent = Math.min(...lines.filter(l => l.trim()).map(l => l.length - l.trimStart().length));
    return lines.map(l => l.slice(indent)).join('\n');
  });
}

function scanItems() {
  const publishedAt = new Date(Date.now() - 3600 * 1000).toISOString();
  return [
    { channel: '信報財經新聞', title: '港股反弹 恒指重上18000', url: 'https://youtu.be/aaaaaaaaaa1', publishedAt,
      publishedLabel: '1 小时前', transcript: '00:00 开场', status: '字幕已读取', transcriptInfo: { message: '' },
      bullBear: { bull: 64, bear: 36, note: '偏多：反弹', source: 'ai' } },
    { channel: 'Finance730', title: '美联储纪要显示分歧', url: 'https://youtu.be/aaaaaaaaaa2', publishedAt,
      publishedLabel: '2 小时前', transcript: '', status: '仅供参考，不做推荐', transcriptInfo: { message: '字幕请求被限流（HTTP 429）。' },
      bullBear: { bull: 47, bear: 53, note: '中性：未出现明确方向信号（仅标题）', source: 'rule' } },
    { channel: '游庭皓的財經皓角', error: 'YouTube 返回 429' }
  ];
}

async function runScript(script, env = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'oai-workflow-'));
  try {
    await writeFile(join(dir, 'push.mjs'), script);
    await writeFile(join(dir, 'scan_result.json'), JSON.stringify({ items: scanItems(), hidden: [] }));
    const child = spawn(process.execPath, ['--require', mock, 'push.mjs'], {
      cwd: dir,
      env: { ...process.env, PUSHPLUS_TOKEN: 'test-only-token', PUSHPLUS_TOPIC: '', PUSHPLUS_DEFAULT_TOPIC: defaultTopic,
        DEEPSEEK_API_KEY: '', ENABLE_AI_SUMMARY: 'false', ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', c => { stdout += c; });
    child.stderr.setEncoding('utf8').on('data', c => { stderr += c; });
    const exitCode = await new Promise(resolve => child.on('close', resolve));
    const payloads = stdout.split('\n').filter(l => l.startsWith('PUSHPLUS_MOCK '))
      .map(l => JSON.parse(l.slice('PUSHPLUS_MOCK '.length)));
    return { exitCode, stdout, stderr, payloads };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('工作流手动 / 定时推送：默认一对多发送到群组 oai.1，标题统一，每条多空概率一行且无说明小字', async () => {
  assert.equal(defaultTopic, 'oai.1');
  const scripts = pushScripts();
  assert.equal(scripts.length, 2);
  for (const script of scripts) {
    const r = await runScript(script);
    assert.equal(r.exitCode, 0, r.stderr + r.stdout);
    assert.equal(r.payloads.length, 1);
    const p = r.payloads[0];
    assert.equal(p.topic, 'oai.1');
    assert.equal(p.title, '章鱼 AI · 舆情量化分析');
    assert.equal(p.channel, 'wechat');
    assert.equal(p.template, 'html');
    assert.match(r.stdout, /推送模式：一对多 · 群组 oai\.1/);
    const lines = p.content.match(/<div style="margin-top:6px;padding:3\.75px 6px;[^"]*white-space:nowrap;[^"]*">.*?<\/div>/g) || [];
    assert.deepEqual(lines.map(l => l.replace(/<[^>]+>/g, '')), [
      'AI 多空概率 多 64% ██████░░░░ 空 36%',
      '规则多空概率 多 47% █████░░░░░ 空 53%'
    ]);
    assert.match(p.content, /仅供参考，不做推荐/);
    assert.ok(!/模型：|仅供研究参考，不构成投资建议|未读取视频正文|概率仅依据标题与频道推算|仅标题/.test(p.content));
  }
});

test('工作流推送：输入 / Secrets 的群组编码优先于默认群组', async () => {
  for (const script of pushScripts()) {
    const r = await runScript(script, { PUSHPLUS_TOPIC: ' team-x ' });
    assert.equal(r.exitCode, 0, r.stderr + r.stdout);
    assert.equal(r.payloads[0].topic, 'team-x');
  }
});
