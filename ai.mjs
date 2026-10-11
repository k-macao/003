// ai.mjs — 章鱼 AI·舆情量化分析 · AI 总结与量化舆情分析模块
// 单一职责：接收扫描结果数组 → 按「四步量化舆情分析」分析每个标题并在推送开头输出 AI 总结概括。
// 提供方：DeepSeek（OpenAI 兼容协议）。也支持任意 OpenAI 兼容 base_url，通过环境变量切换。
//
// 四步量化舆情分析：
//   1. 数据采集（采集标题）：定期在 YouTube 搜索关键词（如“大盘走势”、“股票分析”、“港股/美股”），
//      记录前 20-30 个热门视频的：标题、博主粉丝量/观看量、发布时间。
//   2. 文本与情绪打标：用大模型（或简单的关键词脚本）将标题分类为：
//      极度乐观、谨慎乐观、中性观察、谨慎悲观、极度恐慌。
//   3. 加权计算“情绪指数”：观看量越高的视频，其标题代表的情绪权重越大
//      （因为算法把流量倾斜给了它，代表大众正在被这种情绪洗脑）。
//   4. 绘制情绪曲线对照股价：将油管标题折算出的“大众情绪指数”与大盘走势做历史对照。
//      当情绪指数触及历史上下轨时，执行对应的交易策略（情绪极度恐慌时寻找左侧买点，情绪极度贪婪时考虑分批止盈）。
//
// 入口：
//   summarize(items, opts)        → { main, hotTopics, risks, opportunities, perVideo, quant, source } | null
//   buildRuleSummary(items)       → 本地量化舆情分析总结（无 AI Key 或调用失败时的降级概括，绝不冒充 AI）
//   analyzeLongShort(items, opts) → [{ bull, bear, sentiment, weightPct, note, source }]，逐条「AI 多空概率 + 五档情绪标签」
//   renderSummaryHtml(summary, meta) → 推送开头 AI 总结块的 HTML 片段（含四步量化舆情分析与全景多空概率）

import {
  ruleLongShort,
  normalizeProbability,
  sanitizeNote,
  bullBearBar,
  QUANT_KEYWORDS,
  normalizeSentimentLabel,
  sentimentLabel,
  analyzeQuantWorkflow
} from './longshort.mjs';

const DEFAULT_BASE = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_TIMEOUT = 50000;
const PER_VIDEO_TRANSCRIPT_CHARS = 4000; // 单条字幕喂给 AI 的上限
const MAX_ITEMS = 200;                   // 安全上限

function getConfig() {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
  const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;
  const timeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS) || DEFAULT_TIMEOUT;
  return { apiKey, baseUrl, model, timeoutMs };
}

function truncate(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n) + '…（已截断）' : s;
}

/**
 * 基于四步量化舆情分析生成本地规则总结（无 AI Key 或模型不可用时的确定性降级路径，如实标注来源）。
 */
export function buildRuleSummary(items = []) {
  const safeItems = Array.isArray(items) ? items.slice(0, MAX_ITEMS) : [];
  const quant = analyzeQuantWorkflow(safeItems);
  const { collection, tagging, sentimentIndex, curveAndStrategy } = quant;
  const distText = tagging.distribution
    .map(d => `${d.label}${d.count}条(权重${d.weightPct}%)`)
    .join('、');

  const main = [
    `【量化舆情分析】1.数据采集：围绕「${collection.keywords.join(' / ')}」等核心方向采集 ${collection.totalItems} 条热门视频（取前 ${collection.sampleLimit} 条热门样本，记录标题、博主粉丝量/观看量、发布时间，累计流量 ${collection.totalViewsText}）；`,
    `2.文本与情绪打标：按五档分类为 ${distText}，流量主导情绪为「${tagging.dominantByWeight}」；`,
    `3.加权“大众情绪指数”：观看量越高情绪权重越大，折算大众情绪指数为 ${sentimentIndex.index}/100（${sentimentIndex.label}，等权均值 ${sentimentIndex.unweightedIndex}）；`,
    `4.情绪曲线与大盘对照：${curveAndStrategy.bandStatus}，策略参考：${curveAndStrategy.strategyAction}。`
  ].join('');

  const hotTopics = collection.topVideos.slice(0, 5).map(v =>
    `[${v.sentiment}·权重${v.weightPct}%] ${v.channel}：${truncate(v.title, 26)}（${v.trafficLabel}）`
  );
  if (!hotTopics.length) {
    hotTopics.push(`五档情绪分布：${distText}`);
  }

  const bearishVideos = collection.topVideos.filter(v => v.sentiment === '极度恐慌' || v.sentiment === '谨慎悲观');
  const bullishVideos = collection.topVideos.filter(v => v.sentiment === '极度乐观' || v.sentiment === '谨慎乐观');

  const risks = [
    `上轨止盈纪律：当大众情绪指数触及历史上轨（≥${curveAndStrategy.upperBand} 极度贪婪）时考虑分批止盈（当前指数 ${sentimentIndex.index}）`,
    ...bearishVideos.slice(0, 3).map(v => `[${v.sentiment}·权重${v.weightPct}%] ${truncate(v.title, 28)}`)
  ].slice(0, 5);
  if (risks.length < 2) {
    risks.push(`流量倾斜警惕：高观看量视频情绪权重占比高，需防范单一情绪在算法放大下形成拥挤交易`);
  }

  const opportunities = [
    `下轨左侧纪律：当大众情绪指数触及历史下轨（≤${curveAndStrategy.lowerBand} 极度恐慌）时寻找左侧买点（当前：${curveAndStrategy.strategySignal}）`,
    ...bullishVideos.slice(0, 3).map(v => `[${v.sentiment}·权重${v.weightPct}%] ${truncate(v.title, 28)}`)
  ].slice(0, 5);
  if (opportunities.length < 2) {
    opportunities.push(`情绪曲线对照：结合大盘走势与油管标题大众情绪指数（${sentimentIndex.index}/100），把握历史上下轨反转信号`);
  }

  const perVideo = {};
  tagging.perItem.forEach((v, idx) => {
    const raw = safeItems[idx];
    const key = `${idx}:${(raw && raw.channel) || v.channel || '?'}`;
    perVideo[key] = `[${v.sentiment}｜多${v.bull}%/空${v.bear}%｜权重${v.weightPct}%] ${v.note || v.title}`;
  });

  return {
    main,
    hotTopics,
    risks,
    opportunities,
    perVideo,
    quant,
    source: 'rule'
  };
}

function buildPrompt(items, quant) {
  const lines = [];
  lines.push('你是一名中文财经量化舆情编辑，负责按「四步量化舆情分析」分析每个视频标题，并在推送开头生成 AI 总结概括。');
  lines.push('');
  lines.push('【量化舆情分析（必须严格遵循并在总结中完整体现）】');
  lines.push('1. 数据采集（采集标题）：');
  lines.push('   定期在 YouTube 搜索关键词（如“大盘走势”、“股票分析”、“港股/美股”），记录前 20-30 个热门视频的：标题、博主粉丝量/观看量、发布时间。');
  lines.push('2. 文本与情绪打标：');
  lines.push('   将每个标题分类为五档之一：极度乐观、谨慎乐观、中性观察、谨慎悲观、极度恐慌。');
  lines.push('3. 加权计算“情绪指数”：');
  lines.push('   观看量越高的视频，其标题代表的情绪权重越大（因为算法把流量倾斜给了它，代表大众正在被这种情绪洗脑）。');
  lines.push('4. 绘制情绪曲线对照股价：');
  lines.push('   将油管标题折算出的“大众情绪指数”与大盘走势做历史对照。当情绪指数触及历史上下轨时，执行对应的交易策略（情绪极度恐慌时寻找左侧买点，情绪极度贪婪时考虑分批止盈）。');
  lines.push('');
  if (quant) {
    const dist = quant.tagging.distribution.map(d => `${d.label}:${d.count}条(流量权重${d.weightPct}%)`).join(' / ');
    lines.push('【本批样本量化预计算数据（供总结直接引用）】');
    lines.push(`- 样本总数：${quant.collection.totalItems} 条（热门前 ${quant.collection.sampleLimit} 条，累计流量：${quant.collection.totalViewsText}）`);
    lines.push(`- 五档情绪分布：${dist}`);
    lines.push(`- 流量加权「大众情绪指数」：${quant.sentimentIndex.index}/100（定性：${quant.sentimentIndex.label}；等权均值：${quant.sentimentIndex.unweightedIndex}）`);
    lines.push(`- 历史上下轨对照：${quant.curveAndStrategy.bandStatus}（下轨 ${quant.curveAndStrategy.lowerBand} 极度恐慌 / 上轨 ${quant.curveAndStrategy.upperBand} 极度贪婪）`);
    lines.push(`- 策略信号：${quant.curveAndStrategy.strategyAction}`);
    lines.push('');
  }
  lines.push('【输出要求】');
  lines.push('1. 输出严格的 JSON，不要任何额外解释、不要 Markdown 代码块、不要前后缀文字。');
  lines.push('2. 本简报为"全景汇总"，禁止输出任何"个股页"、按个股拆分的板块、单股分析或个股买卖评级（不得出现目标价、买入/卖出评级等个股推荐内容）；可阐述宏观大盘情绪上下轨交易策略（情绪极度恐慌时寻找左侧买点，情绪极度贪婪时考虑分批止盈）。');
  lines.push('3. JSON 字段：');
  lines.push('   {');
  lines.push('     "main": "今日主线与四步量化情绪概括", // 100-220 字，按四步工作流概括：数据采集样本、五档情绪打标分布、流量加权大众情绪指数、历史上下轨与大盘对照策略');
  lines.push('     "hotTopics": ["…"],     // 3-6 条高流量/核心情绪标题热点，带五档情绪标签与权重，每条 ≤ 45 字');
  lines.push('     "risks": ["…"],         // 2-5 条风险点（含情绪过热/上轨分批止盈警示或悲观诱因），每条 ≤ 45 字');
  lines.push('     "opportunities": ["…"], // 2-5 条机会点（含情绪极度恐慌下轨左侧买点线索或乐观催化），每条 ≤ 45 字');
  lines.push('     "perVideo": {            // 给每条视频标题一个五档情绪打标与核心要点');
  lines.push('       "<key>": "[五档情绪标签] 要点" // key 用每条视频开头的编号 "i:channelName"');
  lines.push('     }');
  lines.push('   }');
  lines.push('4. 只基于下方提供的内容做总结，不要编造视频里没有的事实、数字、人名。');
  lines.push('');
  lines.push('【视频清单（含标题、粉丝量/观看量、发布时间、预打标情绪与权重）】');
  items.forEach((x, i) => {
    if (x && x.error) {
      lines.push(`[${i}:${x.channel || '?'}] (扫描异常) ${String(x.error || '').slice(0, 200)}`);
      return;
    }
    const title = truncate(x.title || '(无标题)', 120);
    const channel = truncate(x.channel || '?', 60);
    const published = x.publishedLabel || x.published || '';
    const viewsInfo = [x.viewsText, x.subscribersText].filter(Boolean).join(' / ') || (x.views ? `${x.views}次观看` : '默认等权');
    const tag = sentimentLabel(x);
    const wPct = x.bullBear?.weightPct != null ? `${x.bullBear.weightPct}%` : '';
    const transcript = truncate(x.transcript || '(无字幕)', PER_VIDEO_TRANSCRIPT_CHARS);
    lines.push(`[${i}:${channel}] ${title}`);
    lines.push(`  · 采集元数据：观看/粉丝=${viewsInfo} ｜ 发布时间=${published || '近期'} ｜ 预打标=${tag}${wPct ? ' ｜ 流量权重=' + wPct : ''}`);
    lines.push(`  · 字幕：${transcript}`);
    lines.push('');
  });
  return lines.join('\n');
}

// 从模型可能"夹带"解释文字的输出里抽 JSON
function extractJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch {}
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try { return JSON.parse(fence[1].trim()); } catch {}
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    const slice = trimmed.slice(first, last + 1);
    try { return JSON.parse(slice); } catch {}
  }
  return null;
}

// 归一化模型输出
function normalize(raw, items, quant) {
  if (!raw || typeof raw !== 'object') return null;
  const STOCK_ENTRY_RE = /个股页|個股頁|STOCK PAGE|个股推荐|個股推薦|目标价|目標價|买入评级|買入評級|卖出评级|賣出評級/;
  const toArr = v => Array.isArray(v) ? v.filter(x => x && String(x).trim() && !STOCK_ENTRY_RE.test(String(x))).map(x => String(x).trim().slice(0, 200)) : [];
  const fallback = buildRuleSummary(items);
  const main = typeof raw.main === 'string' && raw.main.trim() ? raw.main.trim().slice(0, 800) : fallback.main;
  const hotTopics = toArr(raw.hotTopics).slice(0, 6);
  const risks = toArr(raw.risks).slice(0, 5);
  const opportunities = toArr(raw.opportunities).slice(0, 5);
  const perVideo = { ...fallback.perVideo };
  if (raw.perVideo && typeof raw.perVideo === 'object') {
    for (const [k, v] of Object.entries(raw.perVideo)) {
      if (typeof v === 'string' && v.trim()) perVideo[String(k)] = v.trim().slice(0, 240);
    }
  }
  return {
    main,
    hotTopics: hotTopics.length ? hotTopics : fallback.hotTopics,
    risks: risks.length ? risks : fallback.risks,
    opportunities: opportunities.length ? opportunities : fallback.opportunities,
    perVideo,
    quant: quant || fallback.quant,
    source: 'ai'
  };
}

/**
 * 调 DeepSeek 总结（未配置 AI Key 或网络异常时，降级为本地四步量化舆情分析总结，确保推送开头始终有完整量化总结）
 * @param {Array} items  扫描结果（与 /api/scan 返回的 items 形状一致）
 * @param {Object} opts  { onLog?: (s)=>void, signal?: AbortSignal, fallbackToRule?: boolean }
 * @returns {Promise<Object|null>}
 */
export async function summarize(items, opts = {}) {
  const onLog = opts.onLog || (() => {});
  const fallbackToRule = opts.fallbackToRule !== false;
  if (!Array.isArray(items) || !items.length) {
    onLog('[ai] 无可总结内容，跳过');
    return null;
  }
  const safeItems = items.slice(0, MAX_ITEMS);
  const quant = analyzeQuantWorkflow(safeItems);
  const cfg = getConfig();
  if (!cfg.apiKey) {
    onLog('[ai] 未配置 DEEPSEEK_API_KEY / OPENAI_API_KEY，使用本地四步量化舆情分析生成推送开头总结');
    return fallbackToRule ? buildRuleSummary(safeItems) : null;
  }

  const prompt = buildPrompt(safeItems, quant);
  onLog(`[ai] 调用 ${cfg.model}，输入 ${items.length} 条，prompt ${prompt.length} 字符`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  const signal = opts.signal || controller.signal;

  let resp;
  try {
    resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: '你是严谨的中文财经量化舆情编辑。严格只回 JSON，不要任何解释。' },
          { role: 'user', content: prompt }
        ]
      }),
      signal
    });
  } catch (e) {
    clearTimeout(timer);
    onLog(`[ai] 网络异常：${e.message || e}`);
    return fallbackToRule ? buildRuleSummary(safeItems) : null;
  }
  clearTimeout(timer);

  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    onLog(`[ai] HTTP ${resp.status}：${t.slice(0, 300)}`);
    return fallbackToRule ? buildRuleSummary(safeItems) : null;
  }

  let data;
  try { data = await resp.json(); }
  catch (e) {
    onLog(`[ai] 响应非 JSON：${e.message}`);
    return fallbackToRule ? buildRuleSummary(safeItems) : null;
  }

  const text = data?.choices?.[0]?.message?.content || '';
  onLog(`[ai] 模型返回 ${text.length} 字符`);
  if (data?.usage) onLog(`[ai] token usage: ${JSON.stringify(data.usage)}`);

  const parsed = extractJson(text);
  if (!parsed) {
    onLog(`[ai] 无法解析 JSON，输出前 300 字：${text.slice(0, 300)}`);
    return fallbackToRule ? buildRuleSummary(safeItems) : null;
  }
  const norm = normalize(parsed, safeItems, quant);
  onLog(`[ai] 总结完成：main ${norm.main.length} 字 / 热点 ${norm.hotTopics.length} / 风险 ${norm.risks.length} / 机会 ${norm.opportunities.length}`);
  return norm;
}

/**
 * 逐条推算「AI 多空概率 + 五档情绪打标」（看多 bull% / 看空 bear%，相加 = 100；
 * 情绪分类：极度乐观 / 谨慎乐观 / 中性观察 / 谨慎悲观 / 极度恐慌）。
 * - 有 AI Key：一次调用覆盖本批全部条目，严格 JSON；
 * - 无 Key / 调用失败 / 单条缺失：该条降级为本地规则推算（source:'rule'，界面上明确标注）。
 * @param {Array} items 扫描结果（形状同 /api/scan 的 items）
 * @param {Object} opts { onLog?: (s)=>void, signal?: AbortSignal, maxTranscriptChars?: number }
 * @returns {Promise<Array<{bull:number,bear:number,sentiment:string,weightPct?:number,note:string,source:'ai'|'rule'}>>} 与 items 等长
 */
export async function analyzeLongShort(items, opts = {}) {
  const onLog = opts.onLog || (() => {});
  const list = Array.isArray(items) ? items : [];
  const results = list.map(x => ruleLongShort(x || {}));
  if (!list.length) return results;

  const attachWeights = () => {
    const q = analyzeQuantWorkflow(list.map((x, i) => ({ ...(x || {}), bullBear: results[i] })));
    q.tagging.perItem.forEach((entry, idx) => {
      if (results[idx]) {
        results[idx].sentiment = normalizeSentimentLabel(results[idx].sentiment, results[idx].bull);
        results[idx].weightPct = entry.weightPct;
        results[idx].weight = entry.weight;
      }
    });
  };

  const cfg = getConfig();
  if (!cfg.apiKey) {
    onLog('[ai-ls] 未配置 DEEPSEEK_API_KEY / OPENAI_API_KEY，多空概率与五档情绪标签降级为本地关键词规则推算');
    attachWeights();
    return results;
  }

  const maxChars = Number(opts.maxTranscriptChars) || 800;
  const lines = [];
  lines.push('你是一名中文财经情绪量化分析师。请按「量化舆情分析」阅读下面每条视频信息（频道 + 标题 + 粉丝量/观看量 + 发布时间 + 字幕摘录），');
  lines.push('为每个标题完成以下两项量化打标：');
  lines.push('1. 文本与情绪打标（sentiment）：将标题严格分类为以下五档之一：');
  lines.push('   极度乐观（bull 75-95）、谨慎乐观（bull 56-74）、中性观察（bull 45-55）、谨慎悲观（bull 26-44）、极度恐慌（bull 5-25）。');
  lines.push('2. 看多概率 bull 与看空概率 bear：二者相加必须等于 100，整数，范围 5-95。');
  lines.push('要求：');
  lines.push('1. 只回严格 JSON，不要任何解释、不要 Markdown 代码块。');
  lines.push('2. 只能依据给定内容判断，不得编造事实、数字或人名。');
  lines.push('3. 禁止输出目标价、买入/卖出评级、个股推荐等任何个股投资建议；note 只描述情绪方向与驱动因素（≤ 24 字）。');
  lines.push('4. 若内容无明显方向（如纯资讯、无字幕且标题中性），bull/bear 给接近 50/50 的中性值，sentiment 写“中性观察”，note 写“中性观察”。');
  lines.push('5. 返回格式：{"longShort":{"<key>":{"bull":68,"bear":32,"sentiment":"谨慎乐观","note":"..."}}}，key 使用每条开头的编号。');
  lines.push('');
  lines.push('【内容清单】');
  list.forEach((x, i) => {
    if (x && x.error) { lines.push(`[${i}:${x.channel || '?'}] (扫描异常，跳过)`); return; }
    const metaParts = [x.viewsText, x.subscribersText, x.publishedLabel || x.published].filter(Boolean).join(' · ');
    lines.push(`[${i}:${String(x.channel || '?')}] ${truncate(x.title || '(无标题)', 120)}${metaParts ? ` （${metaParts}）` : ''}`);
    const t = truncate(x.transcript || '', maxChars);
    lines.push(`  · 字幕：${t || '(无字幕，仅依据标题判断)'}`);
  });
  const prompt = lines.join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  const signal = opts.signal || controller.signal;
  try {
    const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: '你是严谨的中文财经情绪量化分析师。严格只回 JSON，不要任何解释。' },
          { role: 'user', content: prompt }
        ]
      }),
      signal
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      onLog(`[ai-ls] HTTP ${resp.status}：${t.slice(0, 200)}，多空概率降级为本地规则推算`);
      attachWeights();
      return results;
    }
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content || '';
    const parsed = extractJson(text);
    const blocks = parsed && typeof parsed === 'object'
      ? [parsed.longShort, parsed.多空概率, parsed.bullBear, parsed.data].find(b => b && typeof b === 'object' && !Array.isArray(b))
      : null;
    if (!blocks) {
      onLog(`[ai-ls] 无法解析多空概率 JSON，降级为本地规则推算：${text.slice(0, 160)}`);
      attachWeights();
      return results;
    }
    let hit = 0;
    list.forEach((x, i) => {
      const key = `${i}:${String((x && x.channel) || '?')}`;
      const raw = blocks[key] ?? blocks[String(i)] ?? Object.entries(blocks).find(([k]) => k.startsWith(`${i}:`))?.[1];
      const prob = normalizeProbability(raw);
      if (!prob) return;
      const sentiment = normalizeSentimentLabel(raw && typeof raw === 'object' ? raw.sentiment : '', prob.bull);
      const note = sanitizeNote((raw && typeof raw === 'object' && raw.note) || '');
      results[i] = { ...results[i], bull: prob.bull, bear: prob.bear, sentiment, note, source: 'ai' };
      hit++;
    });
    onLog(`[ai-ls] 多空概率与五档情绪：AI 命中 ${hit}/${list.length} 条，其余按本地规则推算`);
  } catch (e) {
    onLog(`[ai-ls] 网络/解析异常：${e.message || e}，多空概率降级为本地规则推算`);
  } finally {
    clearTimeout(timer);
  }
  attachWeights();
  return results;
}

/**
 * 渲染「四步量化舆情分析」HTML 子面板（嵌入在推送开头 AI 总结块中，也可独立渲染）。
 * 严格遵循五档色深（#eafff0 / #00ff66 / #b8f2cb / #8fdca4 / #63b47f）与 7–11.5px 字号规范。
 */
export function renderQuantWorkflowHtml(quant, escFn) {
  if (!quant || typeof quant !== 'object') return '';
  const esc = escFn || (s => String(s || '').replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[c])));
  const { collection, tagging, sentimentIndex, curveAndStrategy } = quant;
  if (!collection || !tagging || !sentimentIndex || !curveAndStrategy) return '';

  const distBadges = (tagging.distribution || []).map(d =>
    `<span style="display:inline-block;margin:1.5px 3px 1.5px 0;padding:1.5px 4.5px;background:#041404;border:1px solid #0a5c2c;color:#b8f2cb;font-size:7.5px;font-weight:700;">${esc(d.label)}: ${d.count}条(权重${d.weightPct}%)</span>`
  ).join('');

  const topTitleRows = (collection.topVideos || []).slice(0, 6).map(v =>
    `<li style="margin:2.5px 0;padding:3px 5px;background:#041404;border-left:2px solid #0d9b4c;color:#8fdca4;font-size:8px;line-height:1.45;">` +
      `<span style="background:#00ff66;color:#041404;padding:0.5px 3px;font-size:7px;font-weight:700;margin-right:3.5px;">#${v.rank} ${esc(v.sentiment)}</span>` +
      `<span style="color:#eafff0;font-weight:700;">${esc(truncate(v.title, 42))}</span>` +
      `<span style="color:#63b47f;font-size:7.5px;"> · ${esc(v.channel)} · ${esc(v.trafficLabel)} · ${esc(v.published)} · 情绪权重 <b style="color:#b8f2cb;">${v.weightPct}%</b>（多${v.bull}%/空${v.bear}%）</span>` +
    `</li>`
  ).join('');

  const curveRows = (curveAndStrategy.curveSeries || []).map(pt =>
    `<div style="display:flex;justify-content:space-between;align-items:center;gap:4px;padding:2px 0;border-bottom:1px dashed #0a5c2c;font-size:7.5px;flex-wrap:wrap;">` +
      `<span style="color:#63b47f;min-width:78px;">${esc(pt.windowLabel)}</span>` +
      `<span style="color:#b8f2cb;font-weight:700;">${esc(pt.bar)} ${pt.sentimentIndex}（${esc(pt.sentimentLabel)}）</span>` +
      `<span style="color:#8fdca4;">对照：${esc(pt.marketTrend)} · ${esc(pt.signal)}</span>` +
    `</div>`
  ).join('');

  const isExtreme = curveAndStrategy.bandZone === 'LOWER_BAND' || curveAndStrategy.bandZone === 'UPPER_BAND';
  const strategyColor = isExtreme ? '#ffb000' : '#00ff66';

  return [
    '<div style="margin-top:7.5px;background:#031203;border:1px solid #0d9b4c;padding:6px 7.5px;">',
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:4.5px;font-family:\'Courier New\',Consolas,monospace;font-size:8.5px;font-weight:700;color:#00ff66;letter-spacing:0.5px;margin-bottom:4.5px;flex-wrap:wrap;">',
        '<div style="display:flex;align-items:center;gap:4.5px;">',
          '<span style="background:#00ff66;color:#041404;padding:0.75px 3.75px;font-size:7px;">QUANT</span>',
          '<span>&gt; 量化舆情分析 · QUANT_WORKFLOW.DAT</span>',
        '</div>',
        `<span style="background:#041404;color:#b8f2cb;padding:0.75px 3.75px;font-size:7px;font-weight:700;">大众情绪指数 ${sentimentIndex.index}/100 · ${esc(sentimentIndex.label)}</span>`,
      '</div>',

      // 步骤 1：数据采集（采集标题）
      '<div style="margin-top:4.5px;padding:4.5px 6px;background:#041404;border-left:3px solid #00ff66;">',
        '<div style="font-size:8px;color:#00ff66;font-weight:700;">1. 数据采集（采集标题）</div>',
        `<div style="margin-top:2px;font-size:8px;color:#8fdca4;line-height:1.5;">定期在油管搜索关键词（如“<b style="color:#b8f2cb;">${esc((collection.keywords || QUANT_KEYWORDS).join('”、“'))}</b>”），记录前 ${esc(collection.topWindowTarget || '20-30')} 个热门视频的：<b style="color:#b8f2cb;">标题、博主粉丝量/观看量、发布时间</b>（本次有效样本 ${collection.totalItems} 条，热门前 ${collection.sampleLimit} 条，覆盖流量 ${esc(collection.totalViewsText)}）。</div>`,
      '</div>',

      // 步骤 2：文本与情绪打标
      '<div style="margin-top:4.5px;padding:4.5px 6px;background:#041404;border-left:3px solid #0d9b4c;">',
        '<div style="font-size:8px;color:#00ff66;font-weight:700;">2. 文本与情绪打标（五档分类）</div>',
        `<div style="margin-top:3px;line-height:1.5;">${distBadges}</div>`,
      '</div>',

      // 步骤 3：加权计算“情绪指数”
      '<div style="margin-top:4.5px;padding:4.5px 6px;background:#041404;border-left:3px solid #00ff66;">',
        '<div style="font-size:8px;color:#00ff66;font-weight:700;">3. 加权计算“情绪指数”（流量倾斜权重）</div>',
        `<div style="margin-top:2px;font-size:8px;color:#8fdca4;line-height:1.5;">观看量越高的视频，其标题代表的情绪权重越大（算法流量倾斜代表大众情绪受其主导）。折算<b style="color:#eafff0;">大众情绪指数 = ${sentimentIndex.index}/100（${esc(sentimentIndex.label)}）</b>｜等权均值 ${sentimentIndex.unweightedIndex}/100（流量偏移 ${sentimentIndex.tiltDelta >= 0 ? '+' : ''}${sentimentIndex.tiltDelta}）。</div>`,
        topTitleRows ? `<ul style="margin:4px 0 0;padding:0;list-style:none;">${topTitleRows}</ul>` : '',
      '</div>',

      // 步骤 4：绘制情绪曲线对照股价
      '<div style="margin-top:4.5px;padding:4.5px 6px;background:#041404;border-left:3px solid ' + strategyColor + ';">',
        '<div style="font-size:8px;color:#00ff66;font-weight:700;">4. 绘制情绪曲线对照股价（历史上下轨 &amp; 交易策略）</div>',
        '<div style="margin-top:2px;font-size:8px;color:#8fdca4;line-height:1.5;">将油管标题折算出的“大众情绪指数”与大盘走势做历史对照。当情绪指数触及历史上下轨时，执行对应的交易策略（<b style="color:#b8f2cb;">情绪极度恐慌时寻找左侧买点，情绪极度贪婪时考虑分批止盈</b>）。</div>',
        `<div style="margin-top:3px;font-family:'Courier New',Consolas,monospace;font-size:8px;color:#b8f2cb;font-weight:700;word-break:break-all;">轨道标尺：${esc(curveAndStrategy.bandGauge)} · 曲线：${esc(curveAndStrategy.sparkline || '▄▅')}</div>`,
        curveRows ? `<div style="margin-top:3px;">${curveRows}</div>` : '',
        `<div style="margin-top:4px;padding:3px 5px;background:#031203;border:1px dashed ${strategyColor};color:${strategyColor};font-size:8px;font-weight:700;line-height:1.45;">▸ 轨道判定：${esc(curveAndStrategy.bandStatus)}<br>▸ 策略执行：${esc(curveAndStrategy.strategyAction)}</div>`,
      '</div>',
    '</div>'
  ].join('');
}

/**
 * 把总结对象渲染成 HTML 片段（DOS 监视器 · 复古终端视觉风格，位于推送开头）
 * @param {Object} summary  summarize() / buildRuleSummary() 的返回值
 * @param {Object} meta     { generatedAt: string, itemCount: number, longShort?: {bull,bear,count,source}, quant?: Object, items?: Array }
 */
export function renderSummaryHtml(summary, meta = {}) {
  if (!summary) return '';
  const esc = s => String(s || '').replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[c]));
  const itemCount = meta.itemCount || 0;
  // 全景多空概率：由各条目的 AI 多空概率汇总而来（见 longshort.mjs aggregateLongShort）
  const ls = meta.longShort && normalizeProbability(meta.longShort) ? meta.longShort : null;
  const lsSource = ls ? (meta.longShort.source === 'ai' ? 'DeepSeek 多空推理' : meta.longShort.source === 'mixed' ? 'DeepSeek + 本地规则' : '本地规则推算') : '';
  const lsBar = ls ? bullBearBar(ls, 16) : '';
  const quant = meta.quant || summary.quant || (Array.isArray(meta.items) && meta.items.length ? analyzeQuantWorkflow(meta.items) : null);
  const quantHtml = quant ? renderQuantWorkflowHtml(quant, esc) : '';

  const li = (arr, badgeText = '::') => (arr && arr.length)
    ? `<ul style="margin:4.5px 0 0 0;padding:0;list-style:none;font-family:'Courier New',Consolas,'SimSun',monospace;">${arr.map(x => `
        <li style="margin:3px 0;padding:3.75px 6px;background:#031203;border-left:3px solid #0d9b4c;color:#b8f2cb;font-weight:700;font-size:9.5px;line-height:1.5;">
          <span style="color:#00ff66;font-weight:700;margin-right:4.5px;">${esc(badgeText)}</span>${esc(x)}
        </li>`).join('')}</ul>`
    : '<p style="margin:4.5px 0 0;color:#63b47f;font-size:8.5px;font-family:\'Courier New\',Consolas,monospace;">（无相关要点）</p>';

  return [
    '<section style="margin:9px 0;border:1px solid #0d9b4c;background:#072007;box-shadow:0 0 8px rgba(0,255,102,0.18);font-family:\'Courier New\',Consolas,\'SimSun\',monospace;">',
      // ── DOS 窗口标题栏 ──
      '<div style="display:flex;justify-content:space-between;align-items:center;background:#00ff66;color:#041404;padding:2.25px 6px;font-family:\'Courier New\',Consolas,monospace;font-size:8px;font-weight:700;letter-spacing:1px;flex-wrap:wrap;gap:3px;">',
        '<div style="display:flex;align-items:center;gap:4.5px;">',
          '<span style="background:#041404;color:#00ff66;padding:0.75px 3.75px;">■</span>',
          '<span>C:\\AI\\SUMMARY.EXE</span>',
        '</div>',
        `<span style="background:#041404;color:#00ff66;padding:0.75px 4.5px;">AI SUMMARY · 基于 ${itemCount} 条情报</span>`,
      '</div>',
      '<div style="padding:7.5px 9px;">',
        // ── 今日主线：黑屏看板 ──
        '<div style="background:#031203;border:1px solid #0d9b4c;padding:7.5px 9px;margin-bottom:7.5px;">',
          '<div style="font-family:\'Courier New\',Consolas,monospace;font-size:8px;color:#00ff66;font-weight:700;letter-spacing:1px;margin-bottom:4.5px;">',
            '▌TODAY MAIN QUEST / ai归纳分析',
          '</div>',
          `<p style="margin:0;color:#eafff0;font-weight:700;line-height:1.65;white-space:pre-wrap;word-break:break-word;font-size:10px;">${esc(summary.main)}</p>`,
          '<div style="margin-top:4.5px;font-family:\'Courier New\',Consolas,monospace;font-size:8px;color:#2c6742;">C:\\&gt; MAIN.TXT █</div>',
        '</div>',
        // ── 四步量化舆情分析看板（数据采集 → 五档打标 → 流量加权情绪指数 → 情绪曲线对照大盘） ──
        quantHtml,
        // ── 全景多空概率（AI 多空概率汇总） ──
        ls ? (
          '<div style="margin-top:7.5px;background:#031203;border:1px solid #0d9b4c;padding:6px 7.5px;">' +
            '<div style="display:flex;align-items:center;gap:4.5px;font-family:\'Courier New\',Consolas,monospace;font-size:8.5px;font-weight:700;color:#00ff66;letter-spacing:0.5px;margin-bottom:4.5px;">' +
              '<span style="background:#00ff66;color:#041404;padding:0.75px 3.75px;font-size:7px;">L/S</span>' +
              '<span>&gt; AI 多空概率</span>' +
              '<span style="margin-left:auto;background:#041404;color:#b8f2cb;padding:0.75px 3.75px;font-size:7px;font-weight:700;">多 ' + ls.bull + '% / 空 ' + ls.bear + '%</span>' +
            '</div>' +
            '<div style="font-family:\'Courier New\',Consolas,monospace;font-size:8.5px;color:#b8f2cb;font-weight:700;line-height:1.7;word-break:break-all;">' + esc(lsBar) + '</div>' +
            '<div style="margin-top:3px;font-family:\'Courier New\',Consolas,monospace;font-size:7px;color:#63b47f;">基于 ' + Number(meta.longShort.count || itemCount) + ' 条内容 · ' + esc(lsSource) + ' · 仅供研究参考，不构成投资建议</div>' +
          '</div>'
        ) : '',
        // ── 热点 ──
        '<div style="margin-top:7.5px;">',
          '<div style="font-family:\'Courier New\',Consolas,monospace;font-size:8.5px;font-weight:700;color:#00ff66;display:flex;align-items:center;gap:4.5px;letter-spacing:0.5px;">',
            '<span style="background:#00ff66;color:#041404;padding:0.75px 3.75px;font-size:7px;">HOT</span>',
            '<span>&gt; 热点话题 · HOT_TOPICS.DAT</span>',
          '</div>',
          li(summary.hotTopics, '*'),
        '</div>',
        // ── 风险 ──
        '<div style="margin-top:7.5px;">',
          '<div style="font-family:\'Courier New\',Consolas,monospace;font-size:8.5px;font-weight:700;color:#ffb000;display:flex;align-items:center;gap:4.5px;letter-spacing:0.5px;">',
            '<span style="background:#ffb000;color:#041404;padding:0.75px 3.75px;font-size:7px;">RISK</span>',
            '<span>&gt; 风险点 · RISKS.DAT</span>',
          '</div>',
          li(summary.risks, '!'),
        '</div>',
        // ── 机会 ──
        '<div style="margin-top:7.5px;">',
          '<div style="font-family:\'Courier New\',Consolas,monospace;font-size:8.5px;font-weight:700;color:#00ff66;display:flex;align-items:center;gap:4.5px;letter-spacing:0.5px;">',
            '<span style="background:#00ff66;color:#041404;padding:0.75px 3.75px;font-size:7px;">OPS</span>',
            '<span>&gt; 机会点 · OPPORTUNITIES.DAT</span>',
          '</div>',
          li(summary.opportunities, '+'),
        '</div>',
      '</div>',
    '</section>'
  ].join('');
}
