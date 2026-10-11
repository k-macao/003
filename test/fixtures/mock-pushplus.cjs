// 测试专用预加载（node --require）：拦截发往 PushPlus 的请求，把请求体打印到 stdout 供测试断言；
// 其余外网请求一律拒绝。测试绝不真实发送微信消息，也不使用真实 Token。
'use strict';

globalThis.fetch = async (url, options = {}) => {
  const href = String(url);
  if (href === 'https://www.pushplus.plus/send') {
    // JSON.stringify 会转义换行，请求体始终是单行
    process.stdout.write(`PUSHPLUS_MOCK ${options.body}\n`);
    return new Response(JSON.stringify({ code: 200, msg: '请求成功', data: 'mock-flow-id' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  throw new Error(`测试环境禁止联网：${href}`);
};
