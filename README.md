# 章鱼 AI · 舆情003 // OCTOPUS AI PANORAMA

> **全网 AI 调研境内境外数据，由多个大模型混合部署 。**

按频道抓取全网最新公开视频，**只保留最近 72 小时内发布的内容**，提取可用中文字幕并为每条内容给出 **五档情绪打标 + AI 多空概率**（看多 / 看空），并在**推送开头 AI 总结概括「量化舆情分析」**，采用 **DOS 监视器 · 复古终端** 视觉规范，生成适配微信阅读的竖版长页面简报并推送到微信（PushPlus）。

### 量化舆情分析（推送开头 AI 总结概括 + 逐条标题打标）

1. **数据采集（采集标题）**：定期在油管搜索关键词（如：`大盘走势`、`股票分析`、`港股/美股` 或频道库热榜），自动记录前 20–30 个（或全量扫描）热门视频的：**标题**、**博主粉丝量 / 观看量**、**发布时间**。
2. **文本与情绪打标**：利用大语言模型（LLM）或简单的关键词规则脚本，将每一个标题分类为：**极度乐观**、**谨慎乐观**、**中性观察**、**谨慎悲观**、**极度恐慌**。
3. **加权计算“情绪指数”**：**观看量越高的视频，赋予的权重越大**（因为算法推荐意味着更多人看到了这个标题，流量倾斜会进一步放大群体情绪共振）。
4. **绘制情绪曲线对照股价**：生成一条属于油管标题的 **“大众情绪指数”** 曲线，去和大盘走势做对比。经过样本积累后即可标出上轨和下轨：**在情绪极度恐慌时寻找左侧买点，在情绪极度贪婪时考虑分批止盈**（仅供参考，不构成投资建议）。

**新栏目：Seeking Alpha 最新分析** —— 直读 `seekingalpha.com/latest-articles` 全球分析文章列表，逐条解析为中文（标题 + 要点）并给出 **AI 多空概率**，与视频情报流同口径做 72 小时时效验证，网页端独立栏目（`05 SEEKING ALPHA`）展示，推送时附加独立块（仅真实读取成功时附加，抓取受限自动降级示例并如实标注）。

---

## 视觉与排版特色

- **DOS 监视器 · 复古终端**：整体 CRT 黑绿屏幕底色（`#041404`），模拟 DOS 时代绿色荧光显像管质感。
- **文字色深五档（标题 / 突出 / 重点 / 正文 / 说明）**：同一套荧光绿，五类文字各占一档色深、互不相同，再用字重与字号辅助拉开，眼睛先看到该看的，其余自动退到背景：

  | 类别 | 颜色 | 字重 / 字号 | 用途 |
  | --- | --- | --- | --- |
  | 标题 | `#eafff0` | 700 / 10–11.5px | 视频标题、AI 今日主线、署名行（最亮） |
  | 突出 | `#00ff66` | 700 / 7–9px | 反白徽章、按钮、DOS 窗口标题栏、行内高亮词（荧光跳色） |
  | 重点 | `#b8f2cb` | 700 / 7–9.5px | 要点列表、关键数字、多空概率数值、行内重点（亮绿） |
  | 正文 | `#8fdca4` | 400 / 9.5px | 字幕摘录、段落主句（中绿） |
  | 说明 | `#63b47f` | 400 / 7–9px | 补充说明、来源标注、免责提示（暗绿） |

  另保留两档装饰层（不参与内容五档）：辅助 `#3f8f5b`（状态标签、页脚小字）、元数据 `#2c6742`（日期、`C:\...` 路径、时间戳、`EXIT` 装饰行）。
  网页端走 CSS 变量与工具类（`--ink-title / --ink-focus / --ink / --ink-note` + `.t-title / .t-focus / .t-body / .t-note / .t-accent`，兼容旧类 `.t-key / .t-sub`）；
  微信推送会剥离 `class`，因此 `app.js` / `ai.mjs` / 工作流里以同样的色值写 inline 样式，两处版式保持一致。
- **色彩规范**：荧光绿磷光主色（`#00ff66`），暗绿辅助（`#3f8f5b`），琥珀警告色（`#ffb000`）；
  反白徽章（荧光绿底 + 黑字）、DOS 窗口标题栏、命令行提示符 `C:\>`、块状光标 `█`、扫描线 + 暗角 + 轻微闪烁。
- **CRT 细节**：屏幕通电亮屏动画（先压成一条亮线再展开）、缓慢下滚的场频亮带、顶部磷光高光、待命提示末尾的闪烁光标；
  键盘焦点一律荧光绿方框（`:focus-visible`），输入框聚焦时边框泛光，选中频道自带荧光；
  全局绿色细滚动条 + `color-scheme: dark`，并完整支持系统「减弱动态效果」（关动画但保留全部视觉，光标保持常亮）。
- **紧凑高信息密度**：全部文字较上一版减小 2px（正文 9.5px，主标题 11.5px）；面板、卡片与内外边距缩至原来的 75%，行距同步收紧，网页与微信内联模板一致，等宽终端字体（VT323 / JetBrains Mono / Noto Sans SC），专为手机竖版阅读与微信生态优化。
- **推送版式不含开机看板**：微信推送长页只保留「命令行页眉 → AI 总结 → 视频情报流 → 尾页声明」，
  不再输出 `SYSTEM BOOT OK` 开机板、`章鱼 AI · 舆情003` 大标题、「多模型协同」说明段与「情报流 · 共 N 条 / 规范：台湾→中国台湾」状态条——
  同样的说明性内容也已从网页首页移除，页面直接从「01 频道清单」开始。
- **多模型混合部署架构**：底层结合使用了多种先进大语言模型（LLM），包括但不限于 Claude、ChatGPT、Gemini、Grok、Qwen 以及 Kimi。

## 频道库：100 个粤语频道（新增入库）

以下 100 个粤语频道已加入频道清单（网页端频道清单与工作流默认全量扫描同步），覆盖香港/澳门财经、新闻媒体、时政知识、大湾区、海外港人与生活娱乐，全部频道均经 YouTube 频道搜索逐一核实：

- **财经投资（30）**：Now 財經 新聞、經濟一週 EDigest、RagaFinance財經台、阿豬 Ah Ju、溫鋼城投藝頻道、LION哥的投資世界、小翠時政財經、Tasty Money 港股直播室、熊麗萍Conita、財經拆局、住加財經 CanFin、富昌金融集團、郭Sir財經、全職炒家 RON LAU、陳sir港股美股分析@致富學院、樂在旅途財經人 連敬涵、粵語最財經、陽光財經粵語頻道、浮浪者 股市浪人、HKStockFinance、港樓x講事Channel、樓市專家 Ken Lui 呂宇健、Talk HK Property、SIU TING MAK、港股研究室、明報財經 MP Finance、灣區揭揭揭 - Tomson實錄、香港小電Callcall、OpenRice大灣區、大灣區夫婦 (Benny & Nicole)
- **新闻媒体（30）**：TVB NEWS Official 無綫新聞、HOY 78 × 有線新聞 Cable News、香港01、RTHK 香港電台、香港電台公共事務組RTHK、星島頭條、明報 Mingpao、on.cc東網、am730、Sky Post晴報、商業電台 Hong Kong Toolbar、灼見名家 Master Insight、灼見名家保健養生、ISD, Hong Kong SAR Government 香港特區政府新聞處、香港新聞頻道、粵語新聞台、MPWeekly明周、星島娛樂、am娛樂、健康730、危險人物 Dangerous Person 2.0、午後檔案、BIGBIGAIR、UNWIRE.HK、Qooah.com、電影Ching報、HKJC、賽馬會青少年體育記者計劃、博擊會Fightclub、TVB (official)
- **澳门（9）**：澳門日報-Macao Daily News、TDM 澳廣視新聞、澳廣視 MACAU TDM、macaogcs 澳門特別行政區政府新聞局、澳門力報 exmoo、澳門教區社會傳播中心CDMCS Macau、官方頻道澳亞衛視、澳門故事、澳門肥坤MacauWK Walker
- **大湾区（5）**：Touch电视剧、Guangdong-Hong Kong-Macao Greater Bay Area粵港澳大灣區、大灣區的蟻民、大灣區侶遊 Couple Travel GBA、巴迪叔叔-港人移居大灣區的退休生活
- **海外港人（7）**：新時代電視 Fairchild Television、Sing Tao A1 Chinese Radio、MingPaoCanada、MingPao Daily Vancouver明報溫哥華、Moon媽在英生活、走佬去UK、JASON
- **美食生活（9）**：Ricky講煮講食、曾鎧琪 Alison【香港曾小妹】、May in Hong Kong 私の香港生活、K.A.T.、東京情報猿、香港美食 by Alexis、HKMINICHEF、リンモク 鈴木 Lingmuk【廣東話學習Vlog】、TVB 奇幻穿越劇場 (TVB Fantasy Drama)
- **TVB娱乐（10）**：TVB 綜藝、TVB Anywhere Life、TVB Best Drama 熱播劇場、TVB Drama – Comedy 喜劇台、TVB Drama – Action & WuXia 動作武俠、TVB Drama - Crime & Mystery 神秘頻道、灼見名家文化教育、星島溫哥華、Fairchild TV FTV、香港人看英國新聞

> 粤语频道与普通话财经频道同放在「中文频道」段（索引 0–152），英文内容源从索引 153 开始；网页端中英文交错排布逻辑（`ENGLISH_SOURCE_START`）已同步更新。

---

## 本地运行

```bash
npm install
npm run check # 语法检查（server / app / ai / freshness / longshort / sensitive-filter / read-throttle）
npm test      # 语法检查 + 读取限速、时效、多空概率、字幕读取、紧凑版式与默认微信推送回归测试
npm start     # 启动服务
# 打开 http://localhost:3000
```

> 自测位于 `test/selftest.mjs`，不依赖网络与 AI Key（无 Key 时走「本地规则推算」降级路径），可直接在本地与 CI 中运行。

## 推送到微信

- 网页默认勾选「扫描完成后自动推送微信」，只在本次扫描成功结束且有有效新内容时发送；取消勾选后仅扫描，仍可手动推送。
- 使用输入的 PushPlus Token，留空时可使用服务端环境变量 `PUSHPLUS_TOKEN`。未配置时只显示待配置提示，不发送。`/api/push-config` 只返回配置状态和渠道，不返回 Token。
- 载入离线示例不会自动推送；手动发送示例需要确认。发送中禁用重复扫描/发送，失败后保留手动重试，不自动重复发送。
- 网页、手动工作流和定时工作流均使用 `channel: 'wechat'`，不携带 `topic`，使用**一对一推送**（仅发送给 `PUSHPLUS_TOKEN` 对应的用户；旧的 `PUSHPLUS_TOPIC` 环境变量 / Secret 不再生效，接口也不再接受群组覆盖）。本次更改默认配置不会主动触发工作流或发送现有数据。

项目使用 [PushPlus（推送加）](https://www.pushplus.plus/) 把简报推送到微信公众号。

## 推送前敏感词过滤

- 推送前会对**最终 HTML 页面可见文本**统一扫描，命中本地词库的内容替换为 `xxx`；HTML 标签、链接属性和页面结构保持不变。
- 网页 `/api/push`、手动工作流、定时工作流均在真正调用 PushPlus 前执行同一套过滤，避免绕过网页端直接推送。
- 本地词库位于 `data/sensitive-words.txt`，来源为 [mimikin/AI-Sensitive-Word-Bank](https://github.com/mimikin/AI-Sensitive-Word-Bank)，固定于提交 [`b3d98147`](https://github.com/mimikin/AI-Sensitive-Word-Bank/commit/b3d98147a08a4af4600622c5ec110b53dee48093)，MIT 许可文本见 `data/AI-Sensitive-Word-Bank.LICENSE`。
- 过滤器实现位于 `sensitive-filter.mjs`：读取源词库 Set 1–3，去重并支持部分跳字 / 拼音变体；源文件的 Set 4 保留在本地归档，但默认不启用，以免单字和常见词造成大面积误报。
- 该词库来自第三方、内容可能不完整或过时；`xxx` 替换是发布前的保守屏蔽，不代表对敏感内容的完整合规保证。

### 获取 Token

1. 访问 https://www.pushplus.plus/ ，用微信扫码登录
2. 在「一对一消息」页面复制你的 token
3. **重要**：根据 PushPlus 规定，2024 年 8 月 1 日起未实名用户无法调用发送接口，请先完成实名认证
4. **一对一推送**：使用 PushPlus「一对一消息」页面的 token，简报仅发送给该 token 对应的用户，无需创建或订阅群组

### 在网页中推送

1. 启动服务后打开页面
2. 选择频道 → 点击「开始全景扫描」
3. 在「推送发射台」中粘贴 token（仅本次本地会话使用，不写入服务器）
4. 点击「推送当前全景简报 → 微信」

### 在 GitHub Actions 中自动推送

1. 仓库 → Settings → Secrets and variables → Actions → New repository secret
   - Name: `PUSHPLUS_TOKEN`
   - Secret: 你的 PushPlus token
   - Name: `DEEPSEEK_API_KEY`（**可选**）
   - Secret: 你的 DeepSeek API key（[获取地址](https://platform.deepseek.com/api_keys)）
2. 进入 Actions →「AI 扫描」→ Run workflow
3. 可选项：
   - `channels`：要扫描的频道，用 `|` 分隔，留空或填 `ALL` 则默认扫描全部 153 个频道
   - `push_to_wechat`：**默认勾选**，扫描完成后自动推送微信；可取消
   - `pushplus_token`：也可在此临时填入（会优先于 Secret）
   - `enable_ai_summary`：默认 `true`，扫描完成后会用 AI 对所有视频字幕做主题聚类总结，拼到推送内容顶部

### 定时自动推送

- 工作流内置定时任务（`schedule`）：**每天澳门时间 09:00 与 17:00** 自动扫描全量 153 个频道并推送微信（对应 GitHub cron：`0 1 * * *` / `0 9 * * *`，UTC）。
- 只需配置好 `PUSHPLUS_TOKEN` Secret，到点即自动推；未配置 token 时仅扫描不推送。

工作流会先跑构建与测试（Node 18 / 20），通过后执行扫描、生成 DOS 监视器 · 复古终端竖版 HTML 简报并调用 PushPlus 推送到微信。

---

## 循环读取限速（降低反爬触发概率）

- **固定节奏：每读取 10 条数据，暂停 10 秒，再继续下一轮**。服务端 `read-throttle.mjs` 使用异步计时器，不阻塞网页、配置查询等其它请求；第 10、20、30… 条处理完成后均会等待，即使刚好是本次最后一条。
- **按读取条目而非简报条数计数**：逐条处理的候选视频与 Seeking Alpha 文章均计入，超出 72 小时、无法验证时间、未取得字幕或处理失败也不会跳过计数。频道搜索 / 列表发现成功时不重复算作条目，失败时计一次尝试，避免全失败时一直快速循环。
- **计数跨批次保留**：同一服务进程的 `/api/scan`、备用频道重试与 `/api/seekingalpha` 共用串行队列和累计计数。网页每批 4 个频道、重复扫描或并发请求都不会重置计数，也不能在 10 秒冷却期间继续发起频道搜索 / 列表读取。
- **GitHub Actions 自动生效**：手动及定时工作流均调用上述服务端扫描入口，无需在工作流里额外叠加休眠。服务重启 / 不同 runner 各自维护计数，不是跨进程的分布式限速。
- **保留诊断与原有超时**：冷却发生在单条读取任务结束后，字幕请求的超时预算不包含排队和批次冷却；日志会显示 `[read-throttle] 已处理 10 条数据，暂停 10 秒后继续`，随后继续累计到 20、30… 条。
- 这是低频、礼貌读取策略，**不绕过验证码、登录或访问控制，也不保证站点不会限流**。仍需遵守数据源条款；HTTP 429、403 等读取失败继续如实显示。

## 时效验证：只保留最近 72 小时内的内容

- **硬规则**：单条内容的发布时间必须落在**最近 72 小时之内**，否则**整条隐藏**（不进入简报、不推送、不占用 50 条额度）。
- **三级取证**（`freshness.mjs` + `server.js`）：
  1. 搜索结果自带的相对时间（`3小时前` / `2 days ago` / `Streamed 2 days ago`）→ 直接裁决；
  2. 相对时间缺失或不可解析 → 读取视频 watch 页的绝对发布时间（`publishDate` / `uploadDate` / `datePublished`）复核；
  3. 仍无法验证发布时间 → **同样隐藏**（绝不把不可考证的内容混进简报）。
- **严格口径**：YouTube 的相对时间按「向上取整」展示，因此按时间区间上界判定 —— `2 天前`（48–72 小时）保留，`3 天前`（72–96 小时）隐藏；`1 周前` 一并隐藏。
- 隐藏数量会在网页状态条（`已隐藏 N 条超 72 小时内容`）、推送页头的 `FRESHNESS CHECK` 说明条与扫描日志中如实标注；若某个来源 72 小时内没有内容，该来源整体隐藏。
- **全为空时不推送**：若本轮所有内容都被隐藏，网页端阻止推送并提示，工作流侧记录日志后跳过推送（不再发送空白简报）。
- 每条内容都会标注时效证据：`3 小时前 · 2026-10-08 07:20 · 时效验证 ✓ 72 小时内`，并在网页端显示 `72 小时 ✓` 徽章。

## AI 多空概率与字幕读取状态

- 简报中**每条内容**都附一个 **AI 多空概率**：`多 X% / 空 Y%`（相加 = 100，范围 5–95），以**单行**终端条形图呈现：`多 ████████░░ 62% ｜ 空 ███░░░░░░░ 38%`（多 / 空 同一行显示，不再拆成两行）。
- 计算来源（`longshort.mjs` + `ai.mjs:analyzeLongShort`）：
  1. 配置了 AI Key（`DEEPSEEK_API_KEY` / `OPENAI_API_KEY`）→ 由大模型依据标题 + 字幕（若有）一次性推算本批全部条目（严格 JSON，温度 0.2）；
  2. 无 Key / 调用失败 / 单条缺失 → **降级为本地规则推算**（看多 / 看空关键词计分，标题权重 ×2）——**绝不冒充 AI 结果**；概率来源仅在日志与 AI 总结块 / SA 栏目标题的汇总口径中标注，每条卡片内不再重复。
- **字幕状态与概率分开**：未读到正文时状态文字标注 `仅供参考，不做推荐`。网页可展开「字幕读取诊断」，微信推送也附失败原因。英文原文未翻译成功时如实标注，不能因频道为英文就标成「中文翻译字幕」。
- AI 总结块顶部另有**全景多空概率**，由各条内容的概率汇总（`aggregateLongShort`）而来。
- **每条卡片不再附说明文字**：`模型：DeepSeek 多空推理 · 仅供研究参考，不构成投资建议` 与 `未读取视频正文 · 概率仅依据标题与频道推算，不代表已分析视频` 均已从每条内容中移除，卡片内只保留方向短注（如 `偏多：反弹 / 內房`）；无短注时该行整体不显示。
- 合规：概率只描述市场情绪方向，**不构成投资建议**；输出统一净化 `目标价 / 买入评级 / 卖出评级 / 个股推荐` 等个股建议措辞，`仅供研究参考，不构成投资建议` 的合规口径保留在 AI 总结块与 SA 栏目标题等汇总位置。

## 新栏目：Seeking Alpha 最新分析

- **来源**：直读 `https://seekingalpha.com/latest-articles`（ALL ANALYSIS ARTICLES）列表页，多策略解析文章标题、链接、发布时间、作者与标的代码（`seekingalpha.mjs`，纯函数可自测）。
- **解析为中文**：英文标题与要点逐条翻译为中文（与英文视频同款翻译端点，失败保留原文并标示，绝不伪造翻译），英文原题以「说明」色深附在中文标题下方。
- **AI 多空概率**：与视频情报流同口径（`analyzeLongShort` AI 推理 / 本地规则兜底），卡片内以**单行**终端条形图呈现 `多 X% ｜ 空 Y%`；栏目标另有 **SA 全景多空概率** 汇总条。
- **时效验证**：SA 列表自带相对时间（`Today, 5:28 PM` / `Yesterday` / `Oct. 7` …），按同一 **72 小时** 窗口裁决，超时或无法验证发布时间的内容隐藏。
- **网页端**：独立栏目 `05 SEEKING ALPHA · 最新分析`（页面载入即读取，按钮 `[F3]` 手动刷新）；SA 对部分网络环境限流（403 / 空页）时**自动降级为示例数据并如实标注**。
- **微信推送**：独立推送块（DOS 窗口 `C:\SA\LATEST.EXE`）插在 AI 总结之后；**仅真实读取成功时附加**，绝不把示例数据当真实情报推送；定时工作流推送同样附带该栏目。
- **读取方式探针**：真实读取采用「探针方式」分级降级（详见下方「无头浏览器探针」一节）——轻量 HTTP 探针被 403 / 空页限流时自动升级为无头浏览器渲染读取；接口返回 `via` 字段（`http#1` / `http#2` / `headless:playwright-core` …），网页状态条会标注「无头浏览器探针」。
- 合规口径与全文一致：仅供研究参考，不构成投资建议。

## 读取搭建方案 · 读取 YouTube 视频标题（三大方案）

以下是读取 YouTube 视频标题的三大高效方案总结（**按推荐程度排序**）：

| 排序 | 方案 | 核心组件 | 适用场景 | 核心优势 |
| --- | --- | --- | --- | --- |
| 一 | **yt-dlp 微服务方案**（综合最佳） | Python + FastAPI + yt-dlp | 需要高并发、高稳定性、作为后端 API 调用的生产环境 | 免无头浏览器、速度极快、不占内存、自带防风控解析机制 |
| 二 | **网页 OpenGraph 解析方案**（最轻量） | Python + requests + BeautifulSoup | 低频查询、临时小脚本、不需要常驻后台服务的轻量任务 | 代码极简（十几行）、零复杂依赖、无需启动服务 |
| 三 | **官方 YouTube Data API v3**（最合规） | Google Developer API Key + HTTP 请求 | 商业级正规产品、长期稳定运行、有合规要求的企业项目 | 100% 官方支持、绝对稳定、永不失效（受每日调用配额限制） |

### 方案一：yt-dlp 微服务方案（综合最佳）

- **核心组件**：Python + FastAPI + yt-dlp
- **适用场景**：需要高并发、高稳定性、作为后端 API 调用的生产环境。
- **核心优势**：免无头浏览器、速度极快、不占内存、自带防风控解析机制。
- **简要说明**：通过 Python 将 yt-dlp 封装为一个轻量级 HTTP 接口，输入链接即可直接返回 JSON 格式的标题及相关元数据。

### 方案二：网页 OpenGraph 解析方案（最轻量）

- **核心组件**：Python + requests + BeautifulSoup
- **适用场景**：低频查询、临时小脚本、不需要常驻后台服务的轻量任务。
- **核心优势**：代码极简（十几行）、零复杂依赖、无需启动服务。
- **简要说明**：直接发起纯 HTTP 请求网页源码，通过提取网页 `<meta property="og:title">` 标签获取标题。

### 方案三：官方 YouTube Data API v3（最合规）

- **核心组件**：Google Developer API Key + HTTP 请求
- **适用场景**：商业级正规产品、长期稳定运行、有合规要求的企业项目。
- **核心优势**：100% 官方支持、绝对稳定、永不失效。
- **简要说明**：通过调用官方提供的视频详情接口，传入 Video ID 和 Key 直接获取纯净数据（受每日调用配额限制）。

### 与本项目现状的对照（截至本次更新，尚未改造）

- 现有标题读取链路仍是**搜索页 HTML 正则解析**：`searchChannel()`（`server.js:189`）请求 `https://www.youtube.com/results?search_query=…`，由 `parseVideosWithStrategies()`（`server.js:100`）用 **5 套策略**从 `ytInitialData` 中提取 `videoId` 与标题（`title.runs[].text` / `simpleText`），全部方向失败才抛异常。
- 发布时间复核读取 watch 页的 `publishDate` / `uploadDate` / `datePublished`（`fetchPublishedAt()`，`server.js:259`）——与**方案二**同源：同一次请求即可顺带取 `<meta property="og:title">` 作为标题兜底。
- **方案一**的依赖入口已存在：`tools/requirements-video-ocr.txt` 已列出 `yt-dlp`，`tools/video_ocr.py` 用它下载视频；落地时可复用 `tools/setup_video_ocr.sh` 创建的 `.venv` 环境。
- **方案三**需要额外的 `YOUTUBE_API_KEY`：当前仓库没有 YouTube Data API v3 相关代码（唯一的 `googleapis` 调用是 `server.js:32` 的免费翻译端点 `translate.googleapis.com`，无需 Key），未配置前不纳入默认链路。
- 本节仅记录方案选型，**不代表已完成改造**；任一方案落地后在此标注实现位置与调用方式。

## 无头浏览器探针（分级降级）

SA 等站点会对机房 IP 限流（403 / 空页），纯 HTTP 探针读不到时，项目以**探针方式**逐级升级为无头浏览器真实渲染读取（`headless.mjs`）：

1. **探针 1 / 2 · 轻量 HTTP 直读**：两套浏览器请求头直读列表页（原有路径，最快）；
2. **探针 3 · 无头浏览器渲染**：HTTP 全部失败时，启动无头 Chromium 加载页面（屏蔽图片 / 字体 / 媒体 / 样式表以提速，附基础反自动化标记补丁），取渲染后的 DOM 交回同一套解析器；
3. **全部失败**：如实报错（网页端降级示例数据并标注，推送端不附该栏目），绝不静默伪造。

**方案调研（2026，网上公开资料）**：主流无头浏览器为 [Playwright](https://github.com/microsoft/playwright)（微软，Chromium/Firefox/WebKit，反检测通过率更高）与 [Puppeteer](https://github.com/puppeteer/puppeteer)（Google，CDP 直连）。本项目选用二者的 **`-core` 包**（`playwright-core` / `puppeteer-core`）：均为纯驱动库、**不捆绑浏览器下载**，作为 `optionalDependencies` 安装——装到哪个用哪个（playwright 系优先），安装失败也不影响主流程。

**浏览器可执行文件探针**（`findBrowserExecutable`，逐级探测，取第一个存在的）：

1. 环境变量：`HEADLESS_BROWSER_EXECUTABLE_PATH` / `CHROME_PATH` / `PUPPETEER_EXECUTABLE_PATH` / `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`；
2. 平台常见安装路径（Linux `/usr/bin/chromium*`、`/usr/bin/google-chrome*`，macOS `/Applications/Google Chrome.app` 等；GitHub Actions `ubuntu-latest` 自带 `/usr/bin/google-chrome`，工作流无需改动）；
3. `npx playwright install chromium` 的默认落点（`~/.cache/ms-playwright/chromium-*/…`）。

```bash
# 本地启用无头浏览器探针（任选其一）
npx playwright install chromium                      # 或
HEADLESS_BROWSER_EXECUTABLE_PATH=/path/to/chrome npm start
# 探针状态自检
curl http://localhost:3000/api/headless-status
```

探针不可用时 `/api/headless-status` 与扫描日志都会如实给出原因；`npm test` 中的探针回归测试不依赖真实浏览器与网络。

## 注意事项与规范

- 频道清单包含原有中文财经频道及新增的 **70 个英文新闻／社交媒体内容源（新增 20 个 Reddit／moomoo 来源）**（如 Bloomberg、CNBC、Reuters、Reddit、Stocktwits、X、LinkedIn）
- 每个内容源先解析最多 **6 条候选**，经 72 小时时效验证后最多保留 **3 条**；为保持微信简报紧凑，单次扫描与推送最多保留 **50 条（最近 72 小时内的）内容**
- 英文来源的标题会翻译为中文，英文字幕优先请求 YouTube 的中文自动翻译；无字幕时保留原视频链接，明确提示未读取正文；仅标题推算不能替代视频分析
- 术语规范：出现「台湾／台灣」时统一显示为「中国台湾」
- **不推个股页**：推送只保留全景汇总，任何按个股拆分的板块/页面（`<section data-kind="stock-page">`、class 含 `stock-page`、或带「个股页 / STOCK PAGE」徽标的段落）会在发送前自动剥离；AI 总结亦不输出个股页、单股分析或买卖建议（目标价、买卖评级等）
- 推送标题统一为：`章鱼 AI · 舆情003`（已去除 PushPlus 与时间戳）

---

## 关于 10 万字限制

PushPlus 单条消息内容上限约 10 万字。本项目在 `server.js` 和 CI 工作流中都按 **10 万文字（100,000 字符）** 做控制与自动切分：

- 单条简报超过 **100,000 字符**（按字符数计，与 PushPlus 10 万字上限同口径）时，按 `<section>` 边界自动拆成多条
- 每条标题带 `(1/N) (2/N) …` 编号，便于在微信中按顺序阅读
- 每条都包含简报头部和免责声明，可独立阅读
- 多条之间间隔 0.8 秒发送，避免触发 PushPlus 频率限制

---

## 尾页说明与作者声明

```
作者：章鱼 ai      仅供参考，分析研究

全网境内外为你寻找蛛丝马迹-提供全景视野分析 由多模型协同推理决策 ，底层所使用的大语言模型（LLM）多模式背后结合使用了多种不同的先进模型，包括但不限于 Claude、ChatGPT、Gemini、Grok、Qwen 以及 Kimi。 根据不同的资产管理任务需求，更好地发挥各个模型的优势来提供数据支持！[加油]
```

---

## 视频画面文字提取（OCR）

`tools/video_ocr.py` 可读取视频画面中出现的文字（字幕条、标题、数据板等），与语音字幕互补。

```bash
bash tools/setup_video_ocr.sh                            # 在 .venv 安装，修复 OpenCV 冲突
.venv/bin/python tools/video_ocr.py ./video.mp4 -o out.md              # 本地视频
.venv/bin/python tools/video_ocr.py "https://www.youtube.com/watch?v=实际视频ID" --json   # 视频链接（需 yt-dlp）
.venv/bin/python tools/video_ocr.py ./video.mp4 --interval 1           # 每秒抽一帧，更细但更慢
```

流程：ffmpeg 按间隔抽帧 → RapidOCR 识别中英文 → 相邻帧相同文字合并为带时间段的段落。
注意：英文单词间空格可能丢失，中文不受影响；未接入 `server.js` 的推送流程。


### “视频文字读不了”具体怎么处理？

| 要读取的内容 | 当前能力 / 解决办法 |
| --- | --- |
| YouTube 人工字幕、自动字幕 | 扫描通过 `captions.mjs` 读取。优先 watch 页的签名轨道，其次 list 发现与直连兜底，保留 `kind=asr` 和命名轨道参数；支持 XML、srv3、JSON3。 |
| 视频画面的字幕条、标题、表格文字 | 用上方 OCR 命令处理本地视频；不依赖公开视频字幕轨道。它提取文字，不理解整张图表的含义。 |
| 视频里只有人说话、画面没有字 | OCR 不适用，需要 Whisper 等语音转写（ASR）；当前仓库**尚未集成 ASR**，不能把标题推算当作转写结果。 |
| YouTube 网络不通或下载受限 | 更换为能合法访问该服务的部署网络，或提供有权使用的本地视频。增加解析器无法解决网络阻断；本地 OCR 无需访问 YouTube。 |

**字幕故障定位：** API 每条视频返回 `transcriptInfo`（`code`、`message`、`source`、`language`、`translated`、`attempts`），不包含签名 URL。网页可展开诊断。
- `network_error`：连接失败，检查部署网络；两个发现入口都失败时停止盲目探测。
- `http_error`：查看 attempts 中的 HTTP 状态码，可能是服务端访问限制。
- `rate_limited`：HTTP 429，停止本次视频的重试，降低扫描频率并稍后再试。
- `timeout`：单次请求默认 8 秒、每个视频读取总预算 25 秒，超时覆盖响应正文。
- `unavailable`：没有拿到可解析正文（无轨道、空响应、验证页等）；**不能断言视频没有文字**。

**OCR 安装故障：** RapidOCR 1.x 会间接引入 `opencv-python`，与 `opencv-python-headless` 共用 `cv2` 文件；仅 `pip install -r ...` 可能在无桌面服务器上触发 `libGL.so.1` 缺失。安装脚本在隔离的 `.venv` 中卸载两种 wheel 后只重装 headless，再检查导入。以后重新安装依赖时也请使用该脚本。此替换满足运行时 `cv2` 接口，但 `pip check` 仍可能报告 RapidOCR 声明的 `opencv-python` 包未安装。

**使用边界：** 默认每 2 秒抽帧，可能漏掉短暂出现的文字，可用 `--interval 0.5` 提高采样频率；这会增加内存、磁盘和时间开销。时间段为采样估计，不是逐帧精确字幕。小字、运动模糊、复杂表格和英文空格仍需人工复核。OCR 尚未接入网页/定时推送，不会在扫描时自动下载所有视频。视频及输出建议放在已忽略的 `.video-work/` 目录。

**离线验证：** `npm test` 包含模拟字幕服务的回归测试，不需要访问 YouTube；`python3 -m unittest discover -s test -p 'test_*.py'` 测试 OCR 参数、相邻帧合并和下载输出隔离。真实在线视频读取仍需在可访问 YouTube 的环境验收。
