import test from 'node:test';
import assert from 'node:assert/strict';
import { compactBriefHtml, dedupeSections, minifyInlineStyles } from '../html-compact.mjs';

test('删除注释与缩进换行，保留行内空格', () => {
  const html = '<div>\n  <!-- 注释 -->\n  <span>a</span> <span>b</span>\n</div>';
  assert.equal(compactBriefHtml(html), '<div><span>a</span> <span>b</span></div>');
});

test('内联 style 语法压缩，去掉多余空格与末尾分号', () => {
  const html = '<p style="margin: 0 ; color : #fff; font-size:9px;  ">x</p>';
  assert.equal(minifyInlineStyles(html), '<p style="margin:0;color:#fff;font-size:9px">x</p>');
});

test('含 url() 的内联样式保持原样', () => {
  const html = '<p style="background:url(a.png) no-repeat;  color:red">x</p>';
  assert.equal(minifyInlineStyles(html), html);
});

test('完全相同的 section 只保留第一次出现', () => {
  const sec = '<section style="x"><p>同一条内容，这里的文字足够长，用于相似度比较测试。</p></section>\n';
  const html = `<div>${sec}${sec}<section><p>另一条内容，和前面完全不同的文字，只是为了占位。</p></section></div>`;
  const out = compactBriefHtml(html);
  assert.equal(out.split('同一条内容').length - 1, 1);
  assert.equal(out.split('另一条内容').length - 1, 1);
});

test('同一链接的 section 视为重复，只保留第一次', () => {
  const a = '<section><a href="https://x.com/v/1/">视频甲：不同的标题A</a><p>摘要一</p></section>';
  const b = '<section><a href="https://x.com/v/1">视频甲：不同的标题B</a><p>摘要二</p></section>';
  const out = dedupeSections(`<div>头</div>${a}${b}<div>尾</div>`);
  assert.equal(out.split('视频甲').length - 1, 1);
  assert.ok(out.includes('头') && out.includes('尾'));
});

test('文字高度相似（仅序号、标点、大小写不同）的 section 去重', () => {
  const a = '<section><h3>#1 DIR ▸ 财经频道</h3><p>美联储宣布降息25个基点，市场反应积极，股指上涨。</p></section>';
  const b = '<section><h3>#2 DIR 财经频道</h3><p>美联储宣布降息25个基点，市场反应积极！股指上涨。</p></section>';
  const out = dedupeSections(a + b);
  assert.equal(out.split('美联储').length - 1, 1);
});

test('内容明显不同的 section 全部保留', () => {
  const html = '<div>头部</div><section><p>A 股市场今日震荡，科技板块领涨。</p></section><section><p>B 欧洲央行维持利率不变，发布会讲话偏鹰。</p></section><div>尾部</div>';
  assert.equal(dedupeSections(html), html);
});

test('短文本：完全相同则去重，仅相似则不去重，避免误删', () => {
  const same = '<section><p>短</p></section><section><p>短</p></section>';
  assert.equal(dedupeSections(same).split('<section>').length - 1, 1);
  const similar = '<section><p>标题A</p></section><section><p>标题B</p></section>';
  assert.equal(dedupeSections(similar), similar);
});

test('压缩后长度不增加', () => {
  const html = '<section style="margin: 0 ;">\n  <p>x</p>\n</section>\n<!-- c -->\n<section style="margin: 0 ;">\n  <p>x</p>\n</section>';
  assert.ok(compactBriefHtml(html).length < html.length);
});
