// 循环读取的礼貌限速：每处理 10 条数据，非阻塞地暂停 10 秒。
// 同一个实例共享计数和队列，分批调用 / 并发调用 / 失败重试都不能重置限速。
import { setTimeout as sleep } from 'node:timers/promises';

export const READ_BATCH_SIZE = 10;
export const READ_PAUSE_MS = 10_000;

/**
 * read(task) 逐条读取，成功、隐藏或失败均计数；每满一批在返回前等待。
 * prepare(task) 用于频道搜索 / 列表发现：同样排队，成功时不占条目计数，
 *               失败时计一次读取尝试，避免空结果 / 网络异常时无休止快速循环。
 * task 内不要再次调用同一实例，以免嵌套排队死锁。
 * sleepImpl / onPause 可注入，测试无需真实等待或联网。
 */
export function createReadThrottle({
  batchSize = READ_BATCH_SIZE,
  pauseMs = READ_PAUSE_MS,
  sleepImpl = sleep,
  onPause = () => {}
} = {}) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new RangeError('batchSize 必须为正整数');
  if (!Number.isSafeInteger(pauseMs) || pauseMs < 0) throw new RangeError('pauseMs 必须为非负整数');
  if (typeof sleepImpl !== 'function' || typeof onPause !== 'function') throw new TypeError('限速回调必须为函数');

  let readCount = 0;
  let queue = Promise.resolve();

  function schedule(task, countRead) {
    if (typeof task !== 'function') throw new TypeError('读取任务必须为函数');
    const result = queue.then(async () => {
      let succeeded = false;
      try {
        const value = await task();
        succeeded = true;
        return value;
      } finally {
        if (countRead || !succeeded) {
          readCount++;
          if (readCount % batchSize === 0) {
            onPause({ readCount, batchSize, pauseMs });
            await sleepImpl(pauseMs);
          }
        }
      }
    });
    // 某条读取失败仍向调用方抛出原错误，但不会卡住后面的循环。
    // 队列覆盖任务和冷却期，后续读取（包括列表发现）不会抢跑。
    queue = result.then(() => {}, () => {});
    return result;
  }

  return {
    read: task => schedule(task, true),
    prepare: task => schedule(task, false)
  };
}
