# 06 · S1 播放层改造 — Opus 预筛 + codex 审（P0 编码阶段，commit fde43e6/5b68312/+收口）

## 元信息

- 审查日期：2026-08-29（无人值守长程段，用户预授权流程内自决，最终拍板权归用户——见任务锚点 §9 待追认）
- 对象：week01-v2.html → week01-v3.html 累计 diff（S1 播放层：Voice→WordAudio/AudioBus ownerToken+phase 模型）
- 链路：Sonnet 编码 → 主会话行号抽查（抓 1 缺陷：pair playbackRate 语义）→ **Opus 预筛（固定环节）BLOCK 2H/4M/6L** → 主会话裁定修复 → codex 审（code-review/advice-only/3 附件 0 截断/confidence high）**1H/1L** → 修复+窄验 → **0-HIGH 放行**
- 原话档案：[_originals/codex_code-review_20260829_124122.final.txt](_originals/codex_code-review_20260829_124122.final.txt)；Opus 预筛全文见任务锚点 §7 摘要与本文件下表

## 拍板记录（Opus 预筛 12 条 + codex 2 条，全真全采纳；两项规格级自决入锚点待追认）

| 来源# | sev | 问题 | 处置 |
|---|---|---|---|
| 预筛H1 | high | 被取消请求经 p.catch→toFallback 复活成 TTS（stopAll 不作废 token） | ✅ finish() 内 seq++ + toFallback settled 守卫 |
| 预筛H2 | high | v2 的 cancel→speak 静默丢弃 workaround（60ms 错拍）被删，兜底大概率无声 | ✅ 兜底 speak 60ms 错拍+复校三要素 |
| 预筛M3 | med | 兜底前不刷语音表，file:// 冷启动误判 failed | ✅ toFallback 进入时 refreshTtsVoice |
| 预筛M4 | med | §2.2「停一切」×D3「音素教学行为不动」规格内部冲突（blend fast 380ms 连发靠叠音） | ✅ 裁定 D3 优先：stopForPhone 变体；规格 §2.2 补例外句；**待追认 P1** |
| 预筛M5 | med | pair target 引用捕获 play(null)→TTS 念"null"；空键契约缺口 | ✅ const t 捕获 + play 入口空键守卫（cancelled 静默） |
| 预筛M6 | med | 兜底语速 0.9 偏快 | ✅ 0.75 对齐 -20% 基线 |
| 预筛L7-L9,L12 | low | 注释矛盾/exam 硬编码/hover 假暗示/词组无缝拼接 | ✅ 全修（L12 修法引入新问题见下 codex#1） |
| 预筛L10 | low | 提示条 z-index 盖顶栏 | ⏸ 延后 S5 真机定（**待追认 P3**） |
| 预筛L11 | low | 验收#4 有语音机器上假阴性 | ✅ 口径改「删键+__disableTtsFallback」（**待追认 P2**） |
| codex#1 | **high** | L12 的 300ms laterOnce 接续无所有权校验——窗内新请求（词/音素）会被迟到的 phrase 反杀；saySeq 校验被删且 laterOnce 只防切页 | ✅ AudioBus 请求代际 gen（stopAll/stopForPhone 递增），ended 时捕获、回调凭代际判废；四场景走查（新词/音素/切页/无干扰）语义正确；blend/pair 同步接续无此窗口。按 codex notes 窄验放行，未再送外审 |
| codex#2 | low | speakFallback 缺 v2 的 resume()，引擎 paused 态 utterance 静默排队→8 秒超时 | ✅ speak 前补 resume() |

codex 确认项：预筛 H1/H2/M4/M5 修复在 diff 中逻辑闭环，未发现新的请求复活/双阶段计时路径问题。

## 门禁结论

**S1 审查通过（0-HIGH），放行 S2 注入与 S3 G1 编码。**

## 自检

第十人统计：14 条中"找不到"0 次。质量自省：codex#1 是我修 L12 时引入（修一处破一处——删 saySeq 时其防护范围没有完整盘点），说明"修复也是改动、改动就要过所有权/生命周期检查"，已记沉淀候选。
