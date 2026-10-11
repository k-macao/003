import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/oai.yml', import.meta.url), 'utf8');
const mirror = await readFile(new URL('../ci.yml.new', import.meta.url), 'utf8');

test('服务端 PushPlus 出口执行本地页面敏感词过滤', () => {
  assert.match(server, /filterSensitiveHtml\(content, \{ collectMatches: true \}\)/);
  assert.match(server, /filterSensitiveText\(rawTitle, \{ collectMatches: true \}\)/);
  assert.match(server, /SENSITIVE_REPLACEMENT/);
});

test('手动与定时工作流在直接调用 PushPlus 前执行同一过滤器', () => {
  assert.equal(workflow, mirror);
  assert.equal((workflow.match(/import \{ filterSensitiveHtml, filterSensitiveText, getSensitiveWordStats \}/g) || []).length, 2);
  assert.equal((workflow.match(/const filteredPage = filterSensitiveHtml\(/g) || []).length, 2);
  assert.equal((workflow.match(/fs\.writeFileSync\('brief\.html', content\)/g) || []).length, 2);
});
