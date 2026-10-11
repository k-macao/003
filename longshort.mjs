// longshort.mjs — AI 多空概率与量化舆情分析模块（单一职责）
//
// 简报里每条内容都带一个「AI 多空概率」（看多 bull% / 看空 bear%，相加 = 100）与「五档情绪标签」：
//   极度乐观 / 谨慎乐观 / 中性观察 / 谨慎悲观 / 极度恐慌
//
// 量化舆情分析（四步法）：
//   1. 数据采集（采集标题）：定期搜索关键词（大盘走势 / 股票分析 / 港股/美股 等），
//      记录前 20-30 个热门视频的：标题、博主粉丝量/观看量、发布时间。
//   2. 文本与情绪打标：将标题分类为：
//      极度乐观、谨慎乐观、中性观察、谨慎悲观、极度恐慌。
//   3. 加权计算“情绪指数”：观看量越高的视频，其标题代表的情绪权重越大
//      （算法把流量倾斜给高热度视频，代表大众情绪正在受其主导）。
//   4. 绘制情绪曲线对照股价：将油管标题折算出的“大众情绪指数”与大盘走势做历史对照；
//      当情绪指数触及历史上下轨时，执行对应交易策略（情绪极度恐慌时寻找左侧买点，情绪极度贪婪时考虑分批止盈）。

/** 步骤 1 默认核心检索关键词 */
export const QUANT_KEYWORDS = ['大盘走势', '股票分析', '港股/美股'];

/** 步骤 1 热门视频记录窗口（前 20–30 个热门视频） */
export const TOP_VIDEO_SAMPLE_MIN = 20;
export const TOP_VIDEO_SAMPLE_MAX = 30;

/** 步骤 2 五档情绪分类（严格按工作流定义） */
export const SENTIMENT_LABELS = ['极度乐观', '谨慎乐观', '中性观察', '谨慎悲观', '极度恐慌'];

/** 步骤 4 历史上下轨阈值（0-100 情绪指数口径：≤25 极度恐慌下轨，≥75 极度贪婪上轨） */
export const SENTIMENT_BANDS = {
  LOWER: 25,
  CENTER: 50,
  UPPER: 75
};

/** 极度乐观（强贪婪）关键词 */
export const EXTREME_BULL_TERMS = [
  '暴涨', '暴漲', '疯涨', '瘋漲', '狂飙', '狂飆', '井喷', '井噴', '史诗级', '史詩級',
  '大牛市', '疯牛', '瘋牛', '全面爆发', '全面爆發', '大爆发', '大爆發', '逼空', '历史新高', '歷史新高',
  '千点大涨', '冲上云霄', '全线暴涨', '全線暴漲', 'skyrocket', 'all-time high', 'explosive rally', 'soar', 'booming'
];

/** 极度恐慌（强恐慌）关键词 */
export const EXTREME_BEAR_TERMS = [
  '暴跌', '崩盘', '崩盤', '股灾', '股災', '血洗', '恐慌', '大崩盘', '大崩盤', '闪崩', '閃崩',
  '熔断', '熔斷', '踩踏', '腰斩', '腰斬', '黑天鹅', '黑天鵝', '全面溃败', '危机爆发', '危機爆發',
  'crash', 'plunge', 'panic', 'bloodbath', 'meltdown', 'collapse'
];

/** 看多（利多）关键词：标题命中权重更高 */
export const BULL_TERMS = [
  '上涨', '上漲', '上升', '走高', '涨', '漲', '拉升', '新高', '创新高', '創新高', '反弹', '反彈', '回升', '回暖',
  '利好', '利多', '超预期', '超預期', '增长', '增長', '突破', '走强', '走強', '牛市', '看多', '乐观', '樂觀',
  '降息', '降准', '降準', '宽松', '寬鬆', '刺激', '复苏', '復甦', '盈利', '上调', '上調', '增持',
  '净流入', '淨流入', '资金流入', '資金流入', '放量上攻', '红盘', '紅盤', 'record high', 'rally', 'surge', 'bullish',
  '暴涨', '暴漲', '疯涨', '瘋漲', '狂飙', '狂飆', '井喷', '井噴', '大牛市', '历史新高', '歷史新高', 'skyrocket', 'soar'
];

/** 看空（利空）关键词 */
export const BEAR_TERMS = [
  '下跌', '下滑', '走低', '跌', '新低', '创新低', '創新低', '回落', '调整', '調整', '利空', '衰退', '暴跌', '崩盘', '崩盤',
  '熊市', '看空', '悲观', '悲觀', '加息', '收紧', '收緊', '通胀', '通脹', '滞胀', '滯脹', '违约', '違約', '裁员', '裁員',
  '亏损', '虧損', '风险', '風險', '危机', '危機', '下调', '下調', '抛售', '拋售', '承压', '承壓', '净流出', '淨流出',
  '资金流出', '資金流出', '不及预期', '不及預期', '利淡', '探底', 'bearish', 'selloff', 'crash', 'recession',
  '股灾', '股災', '血洗', '恐慌', '闪崩', '閃崩', '熔断', '熔斷', '踩踏', '腰斩', '腰斬', 'plunge', 'panic', 'meltdown'
];

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** 统计一段文本里命中的关键词（去重，同一关键词只记一次） */
function countTerms(text, terms) {
  const s = String(text || '');
  if (!s) return [];
  return terms.filter(t => s.includes(t));
}

/**
 * 解析观看量 / 粉丝量文本为整数（支持中文 万/亿/千 与英文 K/M/B）。
 * 无法解析时返回 null。
 */
export function parseViewCount(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : null;
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^(无观看|無觀看|no views|0\s*views?)$/i.test(s)) return 0;
  const m = s.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(亿|億|万|萬|千|k|m|b)?/i);
  if (!m) return null;
  const num = Number(m[1]);
  if (!Number.isFinite(num) || num < 0) return null;
  const unit = (m[2] || '').toLowerCase();
  const mult = (unit === '亿' || unit === '億') ? 1e8
    : unit === 'b' ? 1e9
    : unit === 'm' ? 1e6
    : (unit === '万' || unit === '萬') ? 1e4
    : (unit === '千' || unit === 'k') ? 1e3
    : 1;
  return Math.round(num * mult);
}

/**
 * 将数字格式化为紧凑中文量级（如 1.2万 / 3.5亿 / 8500）。
 */
export function formatViewCount(count, fallbackText = '') {
  const n = typeof count === 'number' && Number.isFinite(count) ? count : parseViewCount(count);
  if (n == null) return String(fallbackText || '').trim();
  if (n >= 1e8) return `${(n / 1e8).toFixed(1).replace(/\.0$/, '')}亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1).replace(/\.0$/, '')}万`;
  return String(Math.round(n));
}

/**
 * 依据看多得分（0–100）或输入文本归一为步骤 2 的五档情绪标签：
 * 极度乐观（≥75）、谨慎乐观（56–74）、中性观察（45–55）、谨慎悲观（26–44）、极度恐慌（≤25）。
 */
export function normalizeSentimentLabel(label, bull = 50) {
  const s = String(label || '').trim();
  if (/极度乐观|極度樂觀|极度贪婪|極度貪婪|extreme\s*(greed|optimis)/i.test(s)) return '极度乐观';
  if (/谨慎乐观|謹慎樂觀|温和乐观|溫和樂觀|偏多乐观|cautious\s*optimis/i.test(s)) return '谨慎乐观';
  if (/中性观察|中性觀察|^中性$|neutral/i.test(s)) return '中性观察';
  if (/谨慎悲观|謹慎悲觀|温和悲观|溫和悲觀|偏空悲观|cautious\s*pessimis/i.test(s)) return '谨慎悲观';
  if (/极度恐慌|極度恐慌|极度悲观|極度悲觀|extreme\s*(fear|panic)/i.test(s)) return '极度恐慌';
  const b = Number.isFinite(Number(bull)) ? Number(bull) : 50;
  if (b >= SENTIMENT_BANDS.UPPER) return '极度乐观';
  if (b >= 56) return '谨慎乐观';
  if (b >= 45) return '中性观察';
  if (b > SENTIMENT_BANDS.LOWER) return '谨慎悲观';
  return '极度恐慌';
}

/**
 * 获取任意条目、概率对象或分数的五档情绪分类标签。
 */
export function sentimentLabel(input) {
  if (input == null) return '中性观察';
  if (typeof input === 'string') return normalizeSentimentLabel(input, 50);
  if (typeof input === 'number') return normalizeSentimentLabel('', input);
  if (typeof input === 'object') {
    const bb = input.bullBear && typeof input.bullBear === 'object' ? input.bullBear : input;
    const bull = Number.isFinite(Number(bb.bull)) ? Number(bb.bull) : 50;
    return normalizeSentimentLabel(bb.sentiment || input.sentiment || '', bull);
  }
  return '中性观察';
}

/**
 * 五档情绪标签对应的基准分值（当模型仅返回分类标签时用于折算指数）。
 */
export function sentimentScoreFromLabel(label) {
  const norm = normalizeSentimentLabel(label, 50);
  if (norm === '极度乐观') return 85;
  if (norm === '谨慎乐观') return 65;
  if (norm === '谨慎悲观') return 35;
  if (norm === '极度恐慌') return 15;
  return 50;
}

/**
 * 本地规则推算多空概率与五档情绪标签（AI 不可用时的降级路径 / 关键词脚本）。
 * 计分：标题命中 ×2、字幕命中 ×1，极值词在标题命中时额外加权；基准 50%，限制在 [10, 90]。
 * @param {{title?:string, originalTitle?:string, transcript?:string, channel?:string, views?:number|string, viewsText?:string, subscribers?:number|string, subscribersText?:string}} item
 * @returns {{bull:number, bear:number, sentiment:string, views:number|null, subscribers:number|null, note:string, source:'rule', hits:{bull:string[],bear:string[]}}}
 */
export function ruleLongShort(item = {}) {
  const titleText = `${item.title || ''} ${item.originalTitle || ''}`;
  const bodyText = String(item.transcript || '').slice(0, 4000);
  const bullHits = [...new Set([...countTerms(titleText, BULL_TERMS), ...countTerms(bodyText, BULL_TERMS)])];
  const bearHits = [...new Set([...countTerms(titleText, BEAR_TERMS), ...countTerms(bodyText, BEAR_TERMS)])];
  const titleBull = countTerms(titleText, BULL_TERMS).length;
  const titleBear = countTerms(titleText, BEAR_TERMS).length;
  const titleExtremeBull = countTerms(titleText, EXTREME_BULL_TERMS).length;
  const titleExtremeBear = countTerms(titleText, EXTREME_BEAR_TERMS).length;
  const bodyBull = countTerms(bodyText, BULL_TERMS).length;
  const bodyBear = countTerms(bodyText, BEAR_TERMS).length;
  const score = (titleBull - titleBear) * 2 + (titleExtremeBull - titleExtremeBear) + (bodyBull - bodyBear);
  const bull = clamp(Math.round(50 + score * 7), 10, 90);
  const bear = 100 - bull;
  const sentiment = normalizeSentimentLabel(item.sentiment, bull);
  const views = parseViewCount(item.views ?? item.viewCount ?? item.viewsText);
  const subscribers = parseViewCount(item.subscribers ?? item.subscriberCount ?? item.subscribersText);
  let note;
  if (bull > 55) note = `偏多：${(bullHits.slice(0, 3).join(' / ') || '情绪偏暖')}`;
  else if (bull < 45) note = `偏空：${(bearHits.slice(0, 3).join(' / ') || '情绪偏冷')}`;
  else note = '中性：未出现明确方向信号';
  if (!bodyText) note += '（仅标题）';
  return { bull, bear, sentiment, views, subscribers, note: sanitizeNote(note), source: 'rule', hits: { bull: bullHits, bear: bearHits } };
}

/**
 * 净化说明文案：禁止出现个股买卖建议类措辞（目标价 / 买入评级 / 卖出评级 / 个股推荐 等），
 * 概率只描述市场情绪方向，不构成投资建议。
 */
export function sanitizeNote(text) {
  let s = String(text || '').replace(/[\r\n\t]+/g, ' ').trim();
  s = s.replace(/(目标价|目標價|买入评级|買入評級|卖出评级|賣出評級|个股推荐|個股推薦|建议买入|建議買入|建议卖出|建議賣出)/g, '方向信号');
  return s.slice(0, 40);
}

/**
 * 归一化任意多空输入（含 AI 返回值）为合法概率：整数、5–95、多 + 空 = 100。
 * 非法输入返回 null。
 */
export function normalizeProbability(raw) {
  if (raw == null) return null;
  let bull = Number(typeof raw === 'object' ? raw.bull : raw);
  if (!Number.isFinite(bull) && typeof raw === 'object' && raw.sentiment) {
    bull = sentimentScoreFromLabel(raw.sentiment);
  }
  if (!Number.isFinite(bull)) return null;
  bull = clamp(Math.round(bull), 5, 95);
  return { bull, bear: 100 - bull };
}

/** “多 62% / 空 38%” */
export function probabilityLabel(bb) {
  const n = normalizeProbability(bb);
  if (!n) return '';
  return `多 ${n.bull}% / 空 ${n.bear}%`;
}

/** 终端风格条形图：多 ████████░░ 62% ｜ 空 ███░░░░░░░ 38% */
export function bullBearBar(bb, width = 10) {
  const n = normalizeProbability(bb);
  if (!n) return '';
  const fill = v => {
    const k = clamp(Math.round(v / 100 * width), 0, width);
    return '█'.repeat(k) + '░'.repeat(width - k);
  };
  return `多 ${fill(n.bull)} ${n.bull}% ｜ 空 ${fill(n.bear)} ${n.bear}%`;
}

/**
 * 步骤 3 流量倾斜权重计算：
 * 观看量越高的视频，其标题代表的情绪权重越大（算法把流量倾斜给高热度视频，代表大众正在受该情绪影响）。
 * 若条目同时带博主粉丝量，作为辅助权重因子（×0.05）；无观看量时回退为基准权重。
 */
export function computeTrafficWeight(item = {}, baselineViews = 1000, hasAnyViews = false) {
  const views = parseViewCount(item.views ?? item.viewCount ?? item.viewsText ?? item.bullBear?.views);
  const subscribers = parseViewCount(item.subscribers ?? item.subscriberCount ?? item.subscribersText ?? item.bullBear?.subscribers);
  let weight;
  if (views != null && views > 0) {
    weight = views + (subscribers != null && subscribers > 0 ? Math.round(subscribers * 0.05) : 0);
  } else if (subscribers != null && subscribers > 0) {
    weight = Math.max(100, Math.round(subscribers * 0.1));
  } else {
    weight = hasAnyViews ? Math.max(1, baselineViews) : 1;
  }
  const viewsLabel = views != null && views > 0 ? `${formatViewCount(views)}观看` : (item.viewsText ? String(item.viewsText).trim() : '');
  const subsLabel = subscribers != null && subscribers > 0 ? `${formatViewCount(subscribers)}粉丝` : (item.subscribersText ? String(item.subscribersText).trim() : '');
  const trafficLabel = [viewsLabel, subsLabel].filter(Boolean).join(' / ') || '默认等权';
  return { weight: Math.max(1, weight), views, subscribers, viewsLabel, subsLabel, trafficLabel };
}

/**
 * 全景汇总概率：支持按观看量/流量加权（无观看量数据时退化为等权平均，保持向后兼容）。
 * @returns {{bull:number,bear:number,sentiment:string,count:number,source:string,weighted:boolean}|null}
 */
export function aggregateLongShort(items = []) {
  const valid = items.filter(x => x && !x.error && normalizeProbability(x.bullBear));
  if (!valid.length) return null;
  const positiveViews = valid
    .map(x => parseViewCount(x.views ?? x.viewCount ?? x.viewsText ?? x.bullBear?.views))
    .filter(v => v != null && v > 0);
  const hasAnyViews = positiveViews.length > 0;
  const baseline = hasAnyViews ? Math.max(100, Math.round(Math.min(...positiveViews) * 0.5)) : 1;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const x of valid) {
    const prob = normalizeProbability(x.bullBear);
    const { weight } = computeTrafficWeight(x, baseline, hasAnyViews);
    weightedSum += prob.bull * weight;
    totalWeight += weight;
  }
  const bull = clamp(Math.round(weightedSum / (totalWeight || valid.length)), 5, 95);
  const aiCount = valid.filter(x => x.bullBear && x.bullBear.source === 'ai').length;
  return {
    bull,
    bear: 100 - bull,
    sentiment: normalizeSentimentLabel('', bull),
    count: valid.length,
    weighted: hasAnyViews,
    source: aiCount === valid.length ? 'ai' : aiCount > 0 ? 'mixed' : 'rule'
  };
}

/** 概率来源说明（用于反白徽章下方的小字，绝不冒充 AI） */
export function probabilitySourceText(source) {
  if (source === 'ai') return '模型：DeepSeek 多空推理';
  if (source === 'mixed') return '模型：DeepSeek + 本地规则';
  return '模型：本地规则（未配置 AI Key）';
}

/**
 * 步骤 4 历史上下轨终端标尺：
 * 直观展示 [下轨25·极度恐慌] ── [中枢50] ── [上轨75·极度贪婪] 与当前大众情绪指数游标 ●
 */
export function sentimentBandGauge(index, width = 20) {
  const val = clamp(Math.round(Number(index) || 50), 0, 100);
  const pos = clamp(Math.round((val / 100) * (width - 1)), 0, width - 1);
  const lowerIdx = Math.round((SENTIMENT_BANDS.LOWER / 100) * (width - 1));
  const upperIdx = Math.round((SENTIMENT_BANDS.UPPER / 100) * (width - 1));
  const chars = [];
  for (let i = 0; i < width; i++) {
    if (i === pos) chars.push('●');
    else if (i === lowerIdx || i === upperIdx) chars.push('│');
    else if (i < pos) chars.push('█');
    else chars.push('░');
  }
  return `下轨${SENTIMENT_BANDS.LOWER}[${chars.join('')}]上轨${SENTIMENT_BANDS.UPPER}`;
}

/**
 * 将一组 0–100 的数值序列绘制为终端字符曲线（▁▂▃▄▅▆▇█）。
 */
export function renderSparkline(values = []) {
  const ticks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  if (!Array.isArray(values) || !values.length) return '';
  return values.map(v => {
    const n = clamp(Number(v) || 50, 0, 100);
    const idx = clamp(Math.round((n / 100) * (ticks.length - 1)), 0, ticks.length - 1);
    return ticks[idx];
  }).join('');
}

/**
 * 依据情绪指数（0–100）判定所处历史轨道区间与对应交易策略（步骤 4）。
 */
export function evaluateSentimentBandStrategy(index) {
  const idx = clamp(Math.round(Number(index) || 50), 5, 95);
  const label = normalizeSentimentLabel('', idx);
  if (idx <= SENTIMENT_BANDS.LOWER) {
    return {
      index: idx,
      label,
      bandZone: 'LOWER_BAND',
      bandStatus: `触及历史下轨（≤${SENTIMENT_BANDS.LOWER} 极度恐慌区）`,
      strategySignal: '左侧买点信号',
      strategyAction: '情绪极度恐慌时寻找左侧买点（大众恐慌情绪集中宣泄，关注超跌反弹与左侧分批布局窗口）'
    };
  }
  if (idx >= SENTIMENT_BANDS.UPPER) {
    return {
      index: idx,
      label,
      bandZone: 'UPPER_BAND',
      bandStatus: `触及历史上轨（≥${SENTIMENT_BANDS.UPPER} 极度贪婪区）`,
      strategySignal: '分批止盈信号',
      strategyAction: '情绪极度贪婪时考虑分批止盈（算法流量高度倾斜乐观标题，警惕情绪过热，考虑分批止盈）'
    };
  }
  if (idx >= 56) {
    return {
      index: idx,
      label,
      bandZone: 'CAUTIOUS_BULL',
      bandStatus: `历史中枢偏上（56–74 谨慎乐观区 · 距上轨${SENTIMENT_BANDS.UPPER}差 ${SENTIMENT_BANDS.UPPER - idx} 点）`,
      strategySignal: '顺势观察 · 候上轨止盈',
      strategyAction: `当前谨慎乐观，顺势对照大盘走势；若情绪指数继续升温触及历史上轨（≥${SENTIMENT_BANDS.UPPER} 极度贪婪）则考虑分批止盈`
    };
  }
  if (idx <= 44) {
    return {
      index: idx,
      label,
      bandZone: 'CAUTIOUS_BEAR',
      bandStatus: `历史中枢偏下（26–44 谨慎悲观区 · 距下轨${SENTIMENT_BANDS.LOWER}差 ${idx - SENTIMENT_BANDS.LOWER} 点）`,
      strategySignal: '防守观察 · 候下轨左侧',
      strategyAction: `当前谨慎悲观，维持防守观察；若恐慌进一步放大触及历史下轨（≤${SENTIMENT_BANDS.LOWER} 极度恐慌）则寻找左侧买点`
    };
  }
  return {
    index: idx,
    label,
    bandZone: 'NEUTRAL',
    bandStatus: `历史中枢区间（45–55 中性观察区 · 下轨${SENTIMENT_BANDS.LOWER} / 上轨${SENTIMENT_BANDS.UPPER}）`,
    strategySignal: '中性观察 · 等上下轨极值',
    strategyAction: `当前多空情绪均衡，维持中性观察；当情绪指数触及历史下轨（≤${SENTIMENT_BANDS.LOWER}）时寻找左侧买点，触及历史上轨（≥${SENTIMENT_BANDS.UPPER}）时考虑分批止盈`
  };
}

/**
 * 推断分片内大盘走势对照描述（结合标题中的大盘/恒指/美股/指数涨跌信号与情绪指数做历史对照）。
 */
function inferMarketComparison(sliceItems, sliceIndex) {
  const text = sliceItems.map(x => `${x.title || ''} ${x.originalTitle || ''}`).join(' ');
  const bullHits = countTerms(text, BULL_TERMS).length;
  const bearHits = countTerms(text, BEAR_TERMS).length;
  let marketTrend;
  if (bullHits > bearHits + 1 || sliceIndex >= 60) marketTrend = '大盘偏强上行 ▲';
  else if (bearHits > bullHits + 1 || sliceIndex <= 40) marketTrend = '大盘承压回调 ▼';
  else marketTrend = '大盘窄幅震荡 ─';

  let signal;
  if (sliceIndex <= SENTIMENT_BANDS.LOWER) signal = '触及下轨 · 寻找左侧买点';
  else if (sliceIndex >= SENTIMENT_BANDS.UPPER) signal = '触及上轨 · 考虑分批止盈';
  else if (sliceIndex >= 56) signal = '情绪温和偏多 · 观察上轨阻力';
  else if (sliceIndex <= 44) signal = '情绪偏空防守 · 观察下轨支撑';
  else signal = '情绪与大盘中枢均衡';

  return { marketTrend, signal };
}

/**
 * 完整执行四步「量化舆情分析」：
 *   Step 1: 数据采集（记录前 20-30 个热门视频：标题、博主粉丝量/观看量、发布时间）
 *   Step 2: 文本与情绪打标（五档分类：极度乐观、谨慎乐观、中性观察、谨慎悲观、极度恐慌）
 *   Step 3: 加权计算“情绪指数”（按观看量流量倾斜加权计算“大众情绪指数”）
 *   Step 4: 绘制情绪曲线对照股价（大众情绪指数 vs 大盘走势历史上下轨对照与交易策略）
 */
export function analyzeQuantWorkflow(items = []) {
  const valid = (Array.isArray(items) ? items : []).filter(x => x && !x.error);
  const positiveViews = valid
    .map(x => parseViewCount(x.views ?? x.viewCount ?? x.viewsText ?? x.bullBear?.views))
    .filter(v => v != null && v > 0);
  const hasViewWeighting = positiveViews.length > 0;
  const baselineViews = hasViewWeighting ? Math.max(100, Math.round(Math.min(...positiveViews) * 0.5)) : 1;

  // 逐条计算多空概率、五档情绪标签、流量权重
  const enriched = valid.map((x, idx) => {
    const fallback = ruleLongShort(x);
    const prob = normalizeProbability(x.bullBear) || { bull: fallback.bull, bear: fallback.bear };
    const sentiment = normalizeSentimentLabel(x.bullBear?.sentiment || x.sentiment, prob.bull);
    const traffic = computeTrafficWeight(x, baselineViews, hasViewWeighting);
    const published = x.publishedLabel || x.published || x.publishedMacau || '近期';
    const note = sanitizeNote(x.bullBear?.note || fallback.note || '');
    return {
      index: idx + 1,
      id: x.id || '',
      channel: x.channel || '未知频道',
      title: x.title || '(无标题)',
      url: x.url || '',
      published,
      publishedMacau: x.publishedMacau || '',
      publishedAgeMs: Number.isFinite(Number(x.publishedAgeMs)) ? Number(x.publishedAgeMs) : null,
      bull: prob.bull,
      bear: prob.bear,
      sentiment,
      views: traffic.views,
      subscribers: traffic.subscribers,
      viewsText: traffic.viewsLabel,
      subscribersText: traffic.subsLabel,
      trafficLabel: traffic.trafficLabel,
      weight: traffic.weight,
      note,
      source: x.bullBear?.source || 'rule',
      rawRef: x
    };
  });

  const totalWeight = enriched.reduce((acc, x) => acc + x.weight, 0) || 1;
  const totalViews = enriched.reduce((acc, x) => acc + (x.views || 0), 0);

  enriched.forEach(x => {
    x.weightPct = Number(((x.weight / totalWeight) * 100).toFixed(1));
    if (x.rawRef && x.rawRef.bullBear && typeof x.rawRef.bullBear === 'object') {
      x.rawRef.bullBear.sentiment = x.sentiment;
      x.rawRef.bullBear.weightPct = x.weightPct;
      if (x.views != null) x.rawRef.bullBear.views = x.views;
    }
  });

  // Step 1: 前 20-30 个热门视频（按流量权重/观看量降序排列，最多取 30 条）
  const sortedByTraffic = [...enriched].sort((a, b) => (b.weight - a.weight) || (b.bull - a.bull));
  const topVideos = sortedByTraffic.slice(0, TOP_VIDEO_SAMPLE_MAX).map((x, i) => ({
    rank: i + 1,
    index: x.index,
    channel: x.channel,
    title: x.title,
    url: x.url,
    views: x.views,
    viewsText: x.viewsText,
    subscribers: x.subscribers,
    subscribersText: x.subscribersText,
    trafficLabel: x.trafficLabel,
    published: x.published,
    publishedMacau: x.publishedMacau,
    sentiment: x.sentiment,
    bull: x.bull,
    bear: x.bear,
    weight: x.weight,
    weightPct: x.weightPct,
    note: x.note
  }));

  // Step 2: 五档情绪分类统计
  const counts = Object.fromEntries(SENTIMENT_LABELS.map(l => [l, 0]));
  const weightsByLabel = Object.fromEntries(SENTIMENT_LABELS.map(l => [l, 0]));
  for (const x of enriched) {
    counts[x.sentiment] = (counts[x.sentiment] || 0) + 1;
    weightsByLabel[x.sentiment] = (weightsByLabel[x.sentiment] || 0) + x.weight;
  }
  const distribution = SENTIMENT_LABELS.map(label => {
    const count = counts[label] || 0;
    const countPct = enriched.length ? Math.round((count / enriched.length) * 100) : 0;
    const weightPct = enriched.length ? Math.round(((weightsByLabel[label] || 0) / totalWeight) * 100) : 0;
    const barFill = clamp(Math.round((weightPct / 100) * 8), 0, 8);
    return {
      label,
      count,
      countPct,
      weightPct,
      bar: '█'.repeat(barFill) + '░'.repeat(8 - barFill)
    };
  });
  const dominantByWeight = [...distribution].sort((a, b) => (b.weightPct - a.weightPct) || (b.count - a.count))[0]?.label || '中性观察';
  const dominantByCount = [...distribution].sort((a, b) => (b.count - a.count) || (b.weightPct - a.weightPct))[0]?.label || '中性观察';

  // Step 3: 加权计算“大众情绪指数”
  const weightedBull = enriched.length
    ? clamp(Math.round(enriched.reduce((acc, x) => acc + x.bull * x.weight, 0) / totalWeight), 5, 95)
    : 50;
  const unweightedBull = enriched.length
    ? clamp(Math.round(enriched.reduce((acc, x) => acc + x.bull, 0) / enriched.length), 5, 95)
    : 50;
  const tiltDelta = weightedBull - unweightedBull;
  const indexLabel = normalizeSentimentLabel('', weightedBull);

  // Step 4: 绘制情绪曲线对照大盘走势 & 历史上下轨交易策略
  const bandStrategy = evaluateSentimentBandStrategy(weightedBull);
  const bandGauge = sentimentBandGauge(weightedBull, 20);

  // 构建时间序列曲线（按发布时间从远到近切分窗口，对照大盘走势）
  const chronological = [...enriched].sort((a, b) => {
    const ageA = a.publishedAgeMs != null ? a.publishedAgeMs : (enriched.length - a.index) * 3600000;
    const ageB = b.publishedAgeMs != null ? b.publishedAgeMs : (enriched.length - b.index) * 3600000;
    return ageB - ageA; // 最早发布的在前，最新的在后
  });

  const bucketCount = Math.min(4, Math.max(2, chronological.length || 1));
  const curveSeries = [];
  if (chronological.length) {
    const chunkSize = Math.max(1, Math.ceil(chronological.length / bucketCount));
    const windowNames = bucketCount === 2
      ? ['前期样本窗口', '当前最新窗口']
      : bucketCount === 3
        ? ['T-2 早期窗口', 'T-1 中期窗口', 'T0 当前窗口']
        : ['T-3 48-72h窗', 'T-2 24-48h窗', 'T-1 6-24h窗', 'T0 当前最新窗'];
    for (let b = 0; b < bucketCount; b++) {
      const slice = chronological.slice(b * chunkSize, (b + 1) * chunkSize);
      if (!slice.length) continue;
      const wSum = slice.reduce((acc, x) => acc + x.weight, 0) || 1;
      const sliceIdx = clamp(Math.round(slice.reduce((acc, x) => acc + x.bull * x.weight, 0) / wSum), 5, 95);
      const sliceLabel = normalizeSentimentLabel('', sliceIdx);
      const { marketTrend, signal } = inferMarketComparison(slice, sliceIdx);
      const fill = clamp(Math.round((sliceIdx / 100) * 10), 0, 10);
      curveSeries.push({
        windowLabel: windowNames[b] || `T-${bucketCount - 1 - b}`,
        sentimentIndex: sliceIdx,
        sentimentLabel: sliceLabel,
        marketTrend,
        signal,
        sampleCount: slice.length,
        bar: '█'.repeat(fill) + '░'.repeat(10 - fill)
      });
    }
  } else {
    curveSeries.push({
      windowLabel: 'T0 当前窗口',
      sentimentIndex: 50,
      sentimentLabel: '中性观察',
      marketTrend: '大盘窄幅震荡 ─',
      signal: '情绪与大盘中枢均衡',
      sampleCount: 0,
      bar: '█████░░░░░'
    });
  }

  const sparkline = renderSparkline(curveSeries.map(p => p.sentimentIndex));

  return {
    collection: {
      keywords: QUANT_KEYWORDS,
      totalItems: enriched.length,
      sampleLimit: topVideos.length,
      topWindowTarget: `${TOP_VIDEO_SAMPLE_MIN}-${TOP_VIDEO_SAMPLE_MAX}`,
      totalViews,
      totalViewsText: totalViews > 0 ? formatViewCount(totalViews) : '默认等权',
      topVideos
    },
    tagging: {
      labels: SENTIMENT_LABELS,
      counts,
      distribution,
      dominantByWeight,
      dominantByCount,
      perItem: enriched
    },
    sentimentIndex: {
      index: weightedBull,
      bearIndex: 100 - weightedBull,
      unweightedIndex: unweightedBull,
      tiltDelta,
      label: indexLabel,
      hasViewWeighting,
      totalViews,
      totalViewsText: totalViews > 0 ? formatViewCount(totalViews) : '默认等权',
      bar: bullBearBar({ bull: weightedBull, bear: 100 - weightedBull }, 16)
    },
    curveAndStrategy: {
      lowerBand: SENTIMENT_BANDS.LOWER,
      centerBand: SENTIMENT_BANDS.CENTER,
      upperBand: SENTIMENT_BANDS.UPPER,
      bandZone: bandStrategy.bandZone,
      bandStatus: bandStrategy.bandStatus,
      strategySignal: bandStrategy.strategySignal,
      strategyAction: bandStrategy.strategyAction,
      strategyRule: '当情绪指数触及历史上下轨时，执行对应的交易策略（情绪极度恐慌时寻找左侧买点，情绪极度贪婪时考虑分批止盈）',
      bandGauge,
      sparkline,
      curveSeries
    }
  };
}
