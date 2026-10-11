import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterSensitiveHtml,
  filterSensitiveText,
  getSensitiveWordStats,
  parseSensitiveWords,
  SENSITIVE_REPLACEMENT,
  SENSITIVE_WORD_SOURCE_COMMIT
} from '../sensitive-filter.mjs';

test('本地敏感词库已导入并固定来源提交', () => {
  const stats = getSensitiveWordStats();
  assert.equal(stats.commit, SENSITIVE_WORD_SOURCE_COMMIT);
  assert.deepEqual(stats.activeSets, [1, 2, 3]);
  assert.ok(stats.words > 10000, `词库过小：${stats.words}`);
  assert.ok(stats.sourceBytes > 100000, `词库文件过小：${stats.sourceBytes}`);
});

test('过滤器命中中文主题词、拼音变体并统一替换为 xxx', () => {
  const result = filterSensitiveText('习近平、天安门、法轮功与 xijinping');
  assert.equal(result, `${SENSITIVE_REPLACEMENT}、${SENSITIVE_REPLACEMENT}、${SENSITIVE_REPLACEMENT}与 ${SENSITIVE_REPLACEMENT}`);
});

test('过滤器跳过源词库 Set 4 的高误报单字/常见词', () => {
  assert.equal(filterSensitiveText('中国市场与普通财经市场'), '中国市场与普通财经市场');
});

test('HTML 过滤只改可见文本，不破坏标签与链接属性', () => {
  const html = '<a href="https://example.com/习近平">习近平相关报道</a><span>普通市场</span>';
  assert.equal(
    filterSensitiveHtml(html),
    '<a href="https://example.com/习近平">xxx相关报道</a><span>普通市场</span>'
  );
});

test('词库解析会忽略 Set 4、空行和格式残片并清理跳字标记', () => {
  const words = parseSensitiveWords('Set 1\n*法*轮*功*\n本?拉登\n\nSet 4\n习\n中国\nSet 3\nxijinping"],s=["bad');
  assert.ok(words.includes('法轮功'));
  assert.ok(words.includes('本拉登'));
  assert.ok(!words.includes('习'));
  assert.ok(!words.includes('中国'));
  assert.ok(!words.some(word => word.includes('],s=[')));
});
