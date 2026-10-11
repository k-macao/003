// 推送前压缩简报 HTML：
// 1) 去掉 HTML 注释（<!-- ... -->），仅用于源码阅读，微信端不显示；
// 2) 去掉仅用于缩进的换行空白（标签之间含换行的空白），不影响文字内容；
// 3) 完全相同的 <section> 区块只保留第一次出现（重复内容一次显示）。
// 注意：不改动文字内容本身，不压缩 pre-wrap 文本中的空格。

const SECTION_SPLIT_RE = /(?=<section\b)/i;

export function stripHtmlComments(html) {
  return String(html || '').replace(/<!--[\s\S]*?-->/g, '');
}

export function stripIndentWhitespace(html) {
  // 只删除“标签与标签之间、且包含换行”的空白，保留行内的空格
  return String(html || '').replace(/>[ \t]*\r?\n\s*</g, '><');
}

export function dedupeSections(html) {
  const pieces = String(html || '').split(SECTION_SPLIT_RE);
  const seen = new Set();
  const out = [];
  for (const piece of pieces) {
    if (!piece) continue;
    // 只对以 <section 开头的完整区块做去重；其余（头部、尾部）原样保留
    if (/^<section\b/i.test(piece)) {
      const key = piece.trim();
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(piece);
  }
  return out.join('');
}

export function compactBriefHtml(html) {
  return dedupeSections(stripIndentWhitespace(stripHtmlComments(html)));
}
