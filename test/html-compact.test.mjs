import test from 'node:test';
import assert from 'node:assert/strict';
import { compactBriefHtml, dedupeSections } from '../html-compact.mjs';

test('删除注释与缩进换行，保留行内空格', () => {
  const html = '<div>\n  <!-- 注释 -->\n  <span>a</span> <span>b</span>\n</div>';
  const out = compactBriefHtml(html);
  assert.equal(out, '<div><span>a</span> <span>b</span></div>');
});

test('完全相同的 section 只保留第一次出现', () => {
  const sec = '<section style="x">\n  <p>同一条</p>\n</section>\n';
  const html = `<div>\n${sec}${sec}<section style="y"><p>另一条</p></section></div>`;
  const out = compactBriefHtml(html);
  assert.equal(out.split('同一条').length - 1, 1);
  assert.equal(out.split('另一条').length - 1, 1);
});

test('不同内容的 section 全部保留，头尾原样', () => {
  const html = '<div>头部</div><section><p>A</p></section><section><p>B</p></section><div>尾部</div>';
  assert.equal(dedupeSections(html), html);
});

test('压缩后长度不增加', () => {
  const html = '<section>\n  <p>x</p>\n</section>\n<!-- c -->\n<section>\n  <p>x</p>\n</section>';
  assert.ok(compactBriefHtml(html).length < html.length);
});
