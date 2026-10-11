// 推送前压缩简报 HTML：
// 1) 去掉 HTML 注释（<!-- ... -->），微信端不显示；
// 2) 去掉仅用于缩进的换行空白（标签之间含换行的空白），不影响文字内容；
// 3) 内联 style 语法压缩：去掉分号、冒号两侧的空格和末尾分号（不改变声明内容与顺序）；
//    不把样式抽成 class 或 <style>，因为微信会剥离 class，<style> 是否保留无法保证；
// 4) 重复区块去重：同一链接、或文字高度相似（字符三元组 Jaccard ≥ 阈值）的 <section> 只保留第一次出现。
// 注意：不改动文字内容本身，不压缩 pre-wrap 文本中的空格。

const SECTION_SPLIT_RE = /(?=<section\b)/i;
const SECTION_RE = /^<section\b[\s\S]*?<\/section>/i;
const MIN_TEXT_FOR_SIMILARITY = 30;

export function stripHtmlComments(html) {
  return String(html || '').replace(/<!--[\s\S]*?-->/g, '');
}

export function stripIndentWhitespace(html) {
  // 只删除“标签与标签之间、且包含换行”的空白，保留行内的空格
  return String(html || '').replace(/>[ \t]*\r?\n\s*</g, '><');
}

export function minifyInlineStyles(html) {
  return String(html || '').replace(/\sstyle="([^"]*)"/g, (match, css) => {
    // 含 url(...) 或 data: 的样式不动，避免破坏资源地址
    if (/url\(|data:/i.test(css)) return match;
    const decls = css
      .split(';')
      .map(d => d.trim())
      .filter(Boolean)
      .map(d => {
        const i = d.indexOf(':');
        return i < 0 ? d : `${d.slice(0, i).trim()}:${d.slice(i + 1).trim()}`;
      });
    if (!decls.length) return '';
    return ` style="${decls.join(';')}"`;
  });
}

function describeSection(sec) {
  const hrefMatch = sec.match(/<a\b[^>]*\bhref="([^"]+)"/i);
  const url = hrefMatch ? hrefMatch[1].trim().replace(/\/+$/, '') : '';
  const text = sec
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/#\d+|\[\d+\]/g, ' ')          // 去掉序号，如 #3、[3]
    .replace(/[^\p{L}\p{N}]+/gu, '')          // 去掉空白与标点、符号
    .toLowerCase();
  return { url, text, grams: trigrams(text) };
}

function trigrams(s) {
  const set = new Set();
  for (let i = 0; i <= s.length - 3; i++) set.add(s.slice(i, i + 3));
  return set;
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function isDuplicate(a, b, threshold) {
  if (a.url && b.url && a.url === b.url) return true;
  if (a.text && a.text === b.text) return true;
  if (a.text.length < MIN_TEXT_FOR_SIMILARITY || b.text.length < MIN_TEXT_FOR_SIMILARITY) return false;
  return jaccard(a.grams, b.grams) >= threshold;
}

export function dedupeSections(html, { threshold = 0.9 } = {}) {
  const pieces = String(html || '').split(SECTION_SPLIT_RE);
  const kept = [];
  let out = '';
  for (const piece of pieces) {
    if (!piece) continue;
    const m = piece.match(SECTION_RE);
    // 非 section 的头部、尾部原样保留
    if (!m) { out += piece; continue; }
    const sec = m[0];
    const rest = piece.slice(sec.length);
    const info = describeSection(sec);
    if (kept.some(k => isDuplicate(k, info, threshold))) {
      out += rest;   // 重复区块丢弃，但保留其后紧跟的非区块内容
      continue;
    }
    kept.push(info);
    out += sec + rest;
  }
  return out;
}

export function compactBriefHtml(html) {
  return dedupeSections(minifyInlineStyles(stripIndentWhitespace(stripHtmlComments(html))));
}
