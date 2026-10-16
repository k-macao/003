import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('服务端一对一推送：旧群组环境变量和请求参数均不能加入 topic', async () => {
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.ok(!source.includes('PUSHPLUS_TOPIC'));
  assert.ok(!source.includes('body.topic'));
  const payloadExpression = source.match(/const payload = (JSON.stringify\([^\n]+\));/)[1];
  const payload = JSON.parse(vm.runInNewContext(payloadExpression, {
    token: 'personal-token', partTitle: '标题', partContent: '内容',
    template: 'html', channel: 'wechat', topic: 'legacy-group',
  }));
  assert.deepEqual(payload, {
    token: 'personal-token', title: '标题', content: '内容', template: 'html', channel: 'wechat',
  });
});
