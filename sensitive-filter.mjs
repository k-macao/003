import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * 本地敏感词过滤器。
 *
 * 词库来源：mimikin/AI-Sensitive-Word-Bank（MIT），以固定提交导入
 * data/sensitive-words.txt。推送前只处理 HTML 可见文本，不改写标签属性，
 * 命中词统一替换成 "xxx"。
 */
export const SENSITIVE_WORD_SOURCE = 'https://github.com/mimikin/AI-Sensitive-Word-Bank';
export const SENSITIVE_WORD_SOURCE_COMMIT = 'b3d98147a08a4af4600622c5ec110b53dee48093';
export const SENSITIVE_WORD_FILE = fileURLToPath(new URL('./data/sensitive-words.txt', import.meta.url));
export const SENSITIVE_REPLACEMENT = 'xxx';

// Set 4 只有单字及“中国”等高误报项，保留在原始归档中，但不默认参与页面过滤。
// Set 1–3 含主题词、变体和拼音，适合在推送前做高召回清洗。
const ACTIVE_SETS = new Set([1, 2, 3]);
const HTML_TOKEN_RE = /<!--[\s\S]*?-->|<[^>]*>/g;
const INVALID_TERM_RE = /[\"'\[\]{}=]/;

function normalizeTerm(raw) {
  return String(raw || '')
    .replace(/^\uFEFF/, '')
    .normalize('NFKC')
    .trim();
}

function hasWordCharacter(term) {
  return /[\p{Script=Han}\p{L}\p{N}]/u.test(term);
}

/**
 * 读取 GitHub 词库的 Set 1–3，去重并清理源文件中极少量的格式残片。
 * 以数组返回，便于测试和构建 trie。
 */
export function parseSensitiveWords(rawText) {
  const words = new Set();
  let currentSet = 0;
  for (const rawLine of String(rawText || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    const setMatch = line.match(/^Set\s+(\d+)$/i);
    if (setMatch) {
      currentSet = Number(setMatch[1]);
      continue;
    }
    if (!line || !ACTIVE_SETS.has(currentSet)) continue;

    const term = normalizeTerm(line);
    if (!term || INVALID_TERM_RE.test(term) || !hasWordCharacter(term)) continue;

    // 源库少数条目用 * / ? 表示跳字或任意字符，加入去掉标记后的连续写法，
    // 例如 *法*轮*功* → 法轮功、 本?拉登 → 本拉登。
    const compact = term.replace(/[\*?]/g, '');
    if (compact.length >= 2 && hasWordCharacter(compact)) words.add(compact);
    if (term.length >= 2) words.add(term);
  }
  return [...words];
}

function buildTrie(words) {
  const root = { next: new Map(), term: '' };
  for (const original of words) {
    const chars = Array.from(original.toLowerCase());
    if (!chars.length) continue;
    let node = root;
    for (const ch of chars) {
      if (!node.next.has(ch)) node.next.set(ch, { next: new Map(), term: '' });
      node = node.next.get(ch);
    }
    // 同一位置优先取最长匹配；遍历时后写入的同长度词不会影响替换结果。
    if (!node.term || chars.length >= Array.from(node.term).length) node.term = original;
  }
  return root;
}

const sourceText = readFileSync(SENSITIVE_WORD_FILE, 'utf8');
const sensitiveWords = parseSensitiveWords(sourceText);
const sensitiveTrie = buildTrie(sensitiveWords);

function findMatches(text) {
  const chars = Array.from(String(text || ''));
  const matches = [];
  let i = 0;
  while (i < chars.length) {
    let node = sensitiveTrie;
    let j = i;
    let best = null;
    while (j < chars.length) {
      const next = node.next.get(chars[j].toLowerCase());
      if (!next) break;
      node = next;
      j += 1;
      if (node.term) best = { start: i, end: j, keyword: node.term };
    }
    if (best) {
      matches.push(best);
      i = best.end;
    } else {
      i += 1;
    }
  }
  return { chars, matches };
}

function replaceMatches(text, found) {
  const chars = found.chars;
  if (!found.matches.length) return String(text || '');
  const out = [];
  let cursor = 0;
  for (const match of found.matches) {
    if (match.start > cursor) out.push(chars.slice(cursor, match.start).join(''));
    out.push(SENSITIVE_REPLACEMENT);
    cursor = match.end;
  }
  if (cursor < chars.length) out.push(chars.slice(cursor).join(''));
  return out.join('');
}

/**
 * 过滤纯文本。默认只返回替换后的字符串；collectMatches 用于日志和诊断。
 */
export function filterSensitiveText(text, { collectMatches = false } = {}) {
  const found = findMatches(text);
  const output = replaceMatches(text, found);
  return collectMatches ? { text: output, matches: found.matches } : output;
}

/**
 * 过滤 HTML 的可见文本，保留标签、属性、链接和样式不变。
 * 这样不会因为词库命中 href / style 而破坏页面结构。
 */
export function filterSensitiveHtml(html, { collectMatches = false } = {}) {
  const source = String(html || '');
  const matches = [];
  let cursor = 0;
  let output = '';
  let token;
  HTML_TOKEN_RE.lastIndex = 0;
  while ((token = HTML_TOKEN_RE.exec(source))) {
    const textPart = source.slice(cursor, token.index);
    const filtered = filterSensitiveText(textPart, { collectMatches: true });
    output += filtered.text + token[0];
    matches.push(...filtered.matches);
    cursor = token.index + token[0].length;
  }
  const tail = filterSensitiveText(source.slice(cursor), { collectMatches: true });
  output += tail.text;
  matches.push(...tail.matches);
  return collectMatches ? { text: output, matches } : output;
}

export function getSensitiveWordStats() {
  return {
    source: SENSITIVE_WORD_SOURCE,
    commit: SENSITIVE_WORD_SOURCE_COMMIT,
    activeSets: [...ACTIVE_SETS],
    words: sensitiveWords.length,
    sourceBytes: Buffer.byteLength(sourceText, 'utf8')
  };
}
