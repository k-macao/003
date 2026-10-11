import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadThrottle, READ_BATCH_SIZE, READ_PAUSE_MS } from '../read-throttle.mjs';

const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

// 记录休眠时长而不真实等十秒；默认生产配置仍必须是 10 条 / 10 秒。
test('默认每 10 条暂停 10000ms；0 / 1 / 9 / 10 / 11 / 20 / 21 条边界', async () => {
  assert.equal(READ_BATCH_SIZE, 10);
  assert.equal(READ_PAUSE_MS, 10000);
  for (const count of [0, 1, 9, 10, 11, 20, 21]) {
    const sleeps = [], pauses = [];
    const throttle = createReadThrottle({
      sleepImpl: async ms => { sleeps.push(ms); },
      onPause: info => pauses.push(info)
    });
    for (let i = 1; i <= count; i++) assert.equal(await throttle.read(() => i), i);
    assert.deepEqual(sleeps, Array(Math.floor(count / 10)).fill(10000), `${count} 条`);
    assert.deepEqual(pauses.map(p => p.readCount), Array.from({ length: Math.floor(count / 10) }, (_, i) => (i + 1) * 10));
    assert.ok(pauses.every(p => p.batchSize === 10 && p.pauseMs === 10000));
  }
});

test('计数跨分批调用保留，第 10 条读完后等待，再开始第 11 条', async () => {
  const events = [];
  const throttle = createReadThrottle({ sleepImpl: async ms => { events.push(`sleep:${ms}`); } });
  for (const batch of [4, 4, 4]) {
    for (let i = 0; i < batch; i++) await throttle.read(() => events.push('read'));
  }
  assert.deepEqual(events, [...Array(10).fill('read'), 'sleep:10000', 'read', 'read']);
});

test('同步 / 异步读取失败均计数，保留原错误，下一条仍可继续', async () => {
  const sleeps = [];
  const throttle = createReadThrottle({ sleepImpl: async ms => { sleeps.push(ms); } });
  for (let i = 0; i < 20; i++) {
    const failure = new Error(`failed ${i}`);
    const read = i % 2 ? async () => { throw failure; } : () => { throw failure; };
    await assert.rejects(throttle.read(read), error => error === failure);
  }
  assert.deepEqual(sleeps, [10000, 10000]);
  assert.equal(await throttle.read(() => 'recovered'), 'recovered');
  assert.deepEqual(sleeps, [10000, 10000]);
});

test('列表发现成功不重复计数，失败计一次读取尝试', async () => {
  const sleeps = [];
  const throttle = createReadThrottle({ sleepImpl: async ms => { sleeps.push(ms); } });
  for (let i = 0; i < 20; i++) assert.equal(await throttle.prepare(() => 'list'), 'list');
  for (let i = 0; i < 9; i++) await throttle.read(() => 'item');
  assert.deepEqual(sleeps, []);
  await assert.rejects(throttle.prepare(() => { throw new Error('no data'); }), /no data/);
  assert.deepEqual(sleeps, [10000]);
  assert.equal(await throttle.prepare(() => 'next list'), 'next list');
  assert.equal(await throttle.read(() => 'next item'), 'next item');
  assert.deepEqual(sleeps, [10000]);
});

test('并发读取串行执行；冷却期间其它读取与列表发现均不能抢跑', async () => {
  const events = [], sleeping = deferred(), release = deferred();
  const throttle = createReadThrottle({ sleepImpl: async ms => {
    events.push(`sleep:${ms}`);
    sleeping.resolve();
    await release.promise;
    events.push('resume');
  } });
  const firstBatch = await Promise.all(Array.from({ length: 9 }, (_, i) => throttle.read(async () => {
    events.push(`read:${i + 1}`);
    await Promise.resolve();
    events.push(`done:${i + 1}`);
    return i + 1;
  })));
  assert.deepEqual(firstBatch, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(events, Array.from({ length: 9 }, (_, i) => [`read:${i + 1}`, `done:${i + 1}`]).flat());

  const tenth = throttle.read(() => { events.push('read:10'); return 10; });
  await sleeping.promise;
  const queued = Promise.all([
    throttle.prepare(() => { events.push('prepare'); return 'list'; }),
    throttle.read(() => { events.push('read:11'); return 11; })
  ]);
  await Promise.resolve();
  assert.deepEqual(events.slice(-2), ['read:10', 'sleep:10000']);
  // 等待让出事件循环，但不允许数据读取任务越过冷却期。
  events.push('unrelated task');
  release.resolve();
  assert.equal(await tenth, 10);
  assert.deepEqual(await queued, ['list', 11]);
  assert.deepEqual(events.slice(-6), ['read:10', 'sleep:10000', 'unrelated task', 'resume', 'prepare', 'read:11']);
});

test('参数与任务校验：拒绝无效限速参数', () => {
  for (const batchSize of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => createReadThrottle({ batchSize }), RangeError);
  }
  for (const pauseMs of [-1, 0.5, NaN, Infinity]) {
    assert.throws(() => createReadThrottle({ pauseMs }), RangeError);
  }
  assert.throws(() => createReadThrottle({ sleepImpl: null }), TypeError);
  assert.throws(() => createReadThrottle({ onPause: null }), TypeError);
  assert.throws(() => createReadThrottle().read(null), TypeError);
});
