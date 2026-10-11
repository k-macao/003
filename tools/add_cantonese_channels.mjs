// 一次性入库脚本：新增 100 个粤语频道（全部经 YouTube 频道搜索逐个核实存在）。
// 运行：node tools/add_cantonese_channels.mjs
import { readFile, writeFile } from 'node:fs/promises';

// ============ 100 个粤语频道（分七组） ============
const groups = {
  // A. 财经/投资/楼市（30）
  '财经投资': [
    'Now 財經 新聞',
    '經濟一週 EDigest',
    'RagaFinance財經台',
    '阿豬 Ah Ju',
    '溫鋼城投藝頻道',
    'LION哥的投資世界',
    '小翠時政財經',
    'Tasty Money 港股直播室',
    '熊麗萍Conita',
    '財經拆局',
    '住加財經 CanFin',
    '富昌金融集團',
    '郭Sir財經',
    '全職炒家 RON LAU',
    '陳sir港股美股分析@致富學院',
    '樂在旅途財經人 連敬涵',
    '粵語最財經',
    '陽光財經粵語頻道',
    '浮浪者 股市浪人',
    'HKStockFinance',
    '港樓x講事Channel',
    '樓市專家 Ken Lui 呂宇健',
    'Talk HK Property',
    'SIU TING MAK',
    '港股研究室',
    '明報財經 MP Finance',
    '灣區揭揭揭 - Tomson實錄',
    '香港小電Callcall',
    'OpenRice大灣區',
    '大灣區夫婦 (Benny & Nicole)',
  ],
  // B. 新闻/时政/媒体/知识（30）
  '新闻媒体': [
    'TVB NEWS Official 無綫新聞',
    'HOY 78 × 有線新聞 Cable News',
    '香港01',
    'RTHK 香港電台',
    '香港電台公共事務組RTHK',
    '星島頭條',
    '明報 Mingpao',
    'on.cc東網',
    'am730',
    'Sky Post晴報',
    '商業電台 Hong Kong Toolbar',
    '灼見名家 Master Insight',
    '灼見名家保健養生',
    'ISD, Hong Kong SAR Government 香港特區政府新聞處',
    '香港新聞頻道',
    '粵語新聞台',
    'MPWeekly明周',
    '星島娛樂',
    'am娛樂',
    '健康730',
    '危險人物 Dangerous Person 2.0',
    '午後檔案',
    'BIGBIGAIR',
    'UNWIRE.HK',
    'Qooah.com',
    '電影Ching報',
    'HKJC',
    '賽馬會青少年體育記者計劃',
    '博擊會Fightclub',
    'TVB (official)',
  ],
  // C. 澳门（9）
  '澳门': [
    '澳門日報-Macao Daily News',
    'TDM 澳廣視新聞',
    '澳廣視 MACAU TDM',
    'macaogcs 澳門特別行政區政府新聞局',
    '澳門力報 exmoo',
    '澳門教區社會傳播中心CDMCS Macau',
    '官方頻道澳亞衛視',
    '澳門故事',
    '澳門肥坤MacauWK Walker',
  ],
  // D. 广东/大湾区（5）
  '大湾区': [
    'Touch电视剧',
    'Guangdong-Hong Kong-Macao Greater Bay Area粵港澳大灣區',
    '大灣區的蟻民',
    '大灣區侶遊 Couple Travel GBA',
    '巴迪叔叔-港人移居大灣區的退休生活',
  ],
  // E. 海外港人（7）
  '海外港人': [
    '新時代電視 Fairchild Television',
    'Sing Tao A1 Chinese Radio',
    'MingPaoCanada',
    'MingPao Daily Vancouver明報溫哥華',
    'Moon媽在英生活',
    '走佬去UK',
    'JASON',
  ],
  // F. 美食/生活/vlog（9）
    '美食生活': [
    'Ricky講煮講食',
    '曾鎧琪 Alison【香港曾小妹】',
    'May in Hong Kong 私の香港生活',
    'K.A.T.',
    '東京情報猿',
    '香港美食 by Alexis',
    'HKMINICHEF',
    'リンモク 鈴木 Lingmuk【廣東話學習Vlog】',
    'TVB 奇幻穿越劇場 (TVB Fantasy Drama)',
  ],
  // G. TVB 系娱乐补充（10）
  'TVB娱乐': [
    'TVB 綜藝',
    'TVB Anywhere Life',
    'TVB Best Drama 熱播劇場',
    'TVB Drama – Comedy 喜劇台',
    'TVB Drama – Action & WuXia 動作武俠',
    'TVB Drama - Crime & Mystery 神秘頻道',
    '灼見名家文化教育',
    '星島溫哥華',
    'Fairchild TV FTV',
    '香港人看英國新聞',
  ],
};

const cantonese = Object.values(groups).flat();
console.log('粤语频道总数:', cantonese.length);
if (cantonese.length !== 100) throw new Error(`需要 100 个，实际 ${cantonese.length}`);
{
  const dup = cantonese.filter((n, i) => cantonese.indexOf(n) !== i);
  if (dup.length) throw new Error('内部重复: ' + dup.join(', '));
}
if (cantonese.some(n => n.includes('|'))) throw new Error('名称包含分隔符 |');

// ============ 1) app.js：插入 sourceNames，并更新 ENGLISH_SOURCE_START ============
const appPath = new URL('../app.js', import.meta.url);
let app = await readFile(appPath, 'utf8');
const m = app.match(/const sourceNames=`([^`]*)`\.split\('\|'\);/);
if (!m) throw new Error('app.js sourceNames 未找到');
const existing = m[1].split('|');
const overlap = cantonese.filter(n => existing.includes(n));
if (overlap.length) throw new Error('与现有频道重复: ' + overlap.join(', '));
const CHINESE_COUNT = 54; // 现有中文段长度
const all = [...existing.slice(0, CHINESE_COUNT), ...cantonese, ...existing.slice(CHINESE_COUNT)];
const NEW_EN_START = all.indexOf('Bloomberg Television');
if (NEW_EN_START !== CHINESE_COUNT + cantonese.length) throw new Error('英文起点异常: ' + NEW_EN_START);
const newLine = 'const sourceNames=`' + all.join('|') + "`.split('|');";
app = app.replace(m[0], newLine);
app = app.replace(/const ENGLISH_SOURCE_START = \d+;/, `const ENGLISH_SOURCE_START = ${NEW_EN_START};`);
app = app.replace(
  /^\/\/ 中文财经频道 \+ 70 个英文资讯\/社交媒体内容源（新增 20 个 Reddit／moomoo 来源）；英文结果会优先转为中文展示。$/m,
  '// 中文财经频道 + 100 个粤语频道（港澳财经/新闻媒体/澳门/大湾区/海外港人/生活娱乐） + 70 个英文资讯/社交媒体内容源；英文结果会优先转为中文展示。'
);
await writeFile(appPath, app);
console.log('app.js 更新完成，总频道数:', all.length, '，ENGLISH_SOURCE_START =', NEW_EN_START);

// ============ 2) 工作流：oai.yml 与 ci.yml.new 内容保持一致 ============
// 默认全量清单只含中文段（现有 54 个财经 + 新增 100 个粤语 = 154 个），与旧版口径一致（英文源不进工作流默认扫描）。
const fullJson = JSON.stringify(all.slice(0, NEW_EN_START));
if (JSON.parse(fullJson).length !== 154) throw new Error('工作流默认清单应为 154 个');
const workflowReplacements = [
  ["description: '要扫描的频道，多个用 | 分隔，留空使用全部 54 个频道全量扫描'",
   "description: '要扫描的频道，多个用 | 分隔，留空使用全部 154 个频道全量扫描'"],
  ['# 默认全量 54 个频道清单', '# 默认全量 154 个频道清单（54 个中文财经 + 100 个粤语频道，与 app.js sourceNames 同步）'],
  ['# 解析频道：支持 | 、, 、换行 分隔；留空或填 ALL 时默认全量 54 个频道', '# 解析频道：支持 | 、, 、换行 分隔；留空或填 ALL 时默认全量 154 个频道'],
  ['# 默认全量推送：与 app.js 同步的 54 个频道', '# 默认全量推送：与 app.js 同步的 154 个频道'],
];
const listAssignRe = /(?:ALL_54_CHANNELS|CHANNELS_JSON)='\[[^\]]*\]'/g;
for (const file of ['.github/workflows/oai.yml', 'ci.yml.new']) {
  const p = new URL('../' + file, import.meta.url);
  let yml = await readFile(p, 'utf8');
  // 频道清单 JSON（两处）
  let listCount = 0;
  yml = yml.replace(listAssignRe, (whole) => {
    listCount++;
    const varName = whole.startsWith('ALL_54_CHANNELS') || whole.startsWith('ALL_CHANNELS') ? 'ALL_CHANNELS' : 'CHANNELS_JSON';
    return `${varName}='${fullJson}'`;
  });
  if (listCount !== 2) throw new Error(`${file}: 频道清单应为 2 处，实际 ${listCount}`);
  for (const [a, b] of workflowReplacements) {
    if (!yml.includes(a)) throw new Error(`${file}: 未找到「${a}」`);
    yml = yml.replaceAll(a, b);
  }
  // 变量引用与扫描时长
  yml = yml.replaceAll('CHANNELS_JSON="$ALL_54_CHANNELS"', 'CHANNELS_JSON="$ALL_CHANNELS"');
  yml = yml.replaceAll('curl -s --max-time 900 -X POST http://localhost:3000/api/scan',
                       'curl -s --max-time 5400 -X POST http://localhost:3000/api/scan');
  // 全量扫描频道数翻近三倍，放宽两个扫描作业的步进超时（30 → 120 分钟）
  yml = yml.replaceAll('timeout-minutes: 30', 'timeout-minutes: 120');
  await writeFile(p, yml);
  console.log(file, '更新完成');
}

// ============ 3) README：频道数量与粤语频道库说明 ============
const readmePath = new URL('../README.md', import.meta.url);
let readme = await readFile(readmePath, 'utf8');
readme = readme.replaceAll('留空或填 `ALL` 则默认扫描全部 54 个频道', '留空或填 `ALL` 则默认扫描全部 154 个频道');
readme = readme.replaceAll('自动扫描全量 54 个频道并推送微信', '自动扫描全量 154 个频道并推送微信');
const sectionTitle = '## 频道库：100 个粤语频道（新增入库）';
if (!readme.includes(sectionTitle)) {
  const list = Object.entries(groups).map(([g, arr]) => `- **${g}（${arr.length}）**：${arr.join('、')}`).join('\n');
  const section = `\n${sectionTitle}\n\n以下 100 个粤语频道已加入频道清单（网页端频道清单与工作流默认全量扫描同步），覆盖香港/澳门财经、新闻媒体、时政知识、大湾区、海外港人与生活娱乐，全部频道均经 YouTube 频道搜索逐一核实：\n\n${list}\n\n> 粤语频道与普通话财经频道同放在「中文频道」段（索引 0–153），英文内容源从索引 154 开始；网页端中英文交错排布逻辑（\`ENGLISH_SOURCE_START\`）已同步更新。\n\n---\n`;
  readme = readme.replace('\n---\n\n## 本地运行', `${section}\n## 本地运行`);
}
await writeFile(readmePath, readme);
console.log('README.md 更新完成');

// ============ 4) 测试断言同步 ============
const testPath = new URL('../test/ui.test.mjs', import.meta.url);
let test = await readFile(testPath, 'utf8');
test = test.replaceAll("assert.equal(names.length, 124);", "assert.equal(names.length, 224);");
test = test.replaceAll("assert.equal(names[54], 'Bloomberg Television');", "assert.equal(names[154], 'Bloomberg Television');");
test = test.replaceAll("assert.match(source, /const ENGLISH_SOURCE_START = 54;/);", "assert.match(source, /const ENGLISH_SOURCE_START = 154;/);");
test = test.replaceAll("(?:ALL_54_CHANNELS|CHANNELS_JSON)", "(?:ALL_CHANNELS|CHANNELS_JSON)");
test = test.replaceAll("assert.equal(channels.length, 54);", "assert.equal(channels.length, 154);");
await writeFile(testPath, test);
console.log('test/ui.test.mjs 更新完成');
