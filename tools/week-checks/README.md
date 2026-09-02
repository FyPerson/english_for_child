# 周课件自检脚本

配合 `docs/声音积木周课件设计规范_20260831_v1.0.md` §13 冒烟清单使用。
所有脚本都从**自身位置**推导仓库根，可用命令行传目标；运行时先打印最终解析路径。

| 文件 | 作用 | 跑法 |
|---|---|---|
| `check_data.js` | 数据层一致性（项数随数据规模变：第二周 360 项、第三周 511 项；第一周课件结构不同，跑不了）。**与周次无关**——跨周会变的量（已教字母集、词卡墙词数、认读词、积木架、点亮墙字母）全部由数据推导或从 `META` 读，第三周原样可用 | `node tools/week-checks/check_data.js <周课件HTML 或 数据层JS>` |
| `smoke_w2_browser.py` | 浏览器冒烟 **97 项**：逐天展开无 undefined / 缺素材降级（配对式断言）/ 关键组件 / 词卡墙 / 明暗主题 / 窄屏 / G3·G4·G5 结算+落盘+刷新恢复 | `python tools/week-checks/smoke_w2_browser.py [目标HTML]` |
| `week02-data.js` | 第二周数据层（由 `tools/extract_data_layer.py` 抽出）。**给外部模型当范例**，也是 `check_data.js` 的独立输入样本 | 见 `docs/第三周数据层交接_*.md` |
| `port.py` + `w2data.py` + `w2days.py` | 第一周 → 第二周的换数据层移植脚本，77 项锚点替换全部断言唯一命中 | 已执行完毕，留档备查 |
| `week03-data.js` | 第三周数据层（Claude 撰写，2026-09-02；codex 首审归档 19 后修订）。校验器 511 项 | `node tools/week-checks/check_data.js tools/week-checks/week03-data.js` |
| `port_w3.py` | 第二周 → 第三周换数据层移植 + 里程碑 0（积木架分组固定位），73 处锚点替换断言唯一命中，数据层常量从 `week03-data.js` 切片注入不手抄。**残留检查在写出前、命中即失败**（禁止表 + 允许表，codex 19 号 M-7）。**不能直接复用于第四周**：源 / 目标 / 旧值 / 大段文案锚点都写死为第二周，且里程碑 1 会改引擎与校验器——W4 按本脚本的结构重写一份。**注意顺序**：本脚本产出的是"无音无图"版；再跑一次会把已注入的 `WORD_AUDIO` 换回第二周的表、把插画常量置空——跑完必须依次重跑 `build_audio.py --manifest tools/audio_manifest_w3.json --target week03.html` 与 `embed_assets.py --target week03.html --assets assets/week03` | `python tools/week-checks/port_w3.py`（可重复执行，结果逐字节一致） |
| `smoke_parent_panel.py` | 家长设置面板冒烟，**与周次无关**（从 HTML 里读 `KEY`），三周各 **27 项**：鼠标（单击 / 0.8 秒 / 右键 1.8 秒都不开，主键 1.8 秒开）、键盘（空格 0.5 秒不开，Enter 1.8 秒开）、触屏（CDP 触摸：滑出 60px 不开，原地 1.8 秒开）、`aria-expanded` 与焦点回位、改开课日期即存、"本周从头再来"单击不清 / 删存储失败不刷新并提示 / 长按后整键删除、刷新、提示条回来、主题键保留 | `python tools/week-checks/smoke_parent_panel.py [week01.html week02.html week03.html]`（不传参跑三周） |
| `smoke_w3_browser.py` | 第三周浏览器冒烟 **154 项**（⑬ 家长设置面板基本路径，完整输入矩阵在上一行）：① 首页 ② 逐天 ③ 新声音区 ④ 换头造词 ⑤ 两扇门 / 裸读 / 小书（含"小书不得偷带 -s"） ⑥ 里程碑 0 分组积木架 ⑦ G3·G4·G5 结算 + 落盘 + 刷新恢复（含 G4 撤回、G5 清空） ⑧ 六个无录音新音逐一元素类型 + 全站哑巴按钮 ⑨ 词卡墙 37 词 / 0 保留词 / 缺图降级 ⑩ 缺素材容器 ⑪ 庆祝层无图 ⑫ 375px 无横向滚动 | `python tools/week-checks/smoke_w3_browser.py [目标HTML]` |

## check_data.js 吃两种输入

```bash
node tools/week-checks/check_data.js week02.html                       # 装配好的周课件
node tools/week-checks/check_data.js tools/week-checks/week02-data.js  # 独立数据层
```

两种输入结果一致（第二周实测都是 360 项，第三周都是 511 项）。**后一种是给外部模型用的**：GPT 写完第三周数据层，
直接跑这个就知道合不合格，不必先装配进 3800 行的 HTML。

## 相关工具（在 tools/ 下）

| 工具 | 作用 |
|---|---|
| `extract_data_layer.py` | 把周课件 HTML 的数据层抽成独立 JS（给外部模型当范例 + 让校验脱离 HTML） |
| `embed_assets.py` | 插画规格化 + 注入四个常量，幂等、原子写出、支持 `--dry-run` |
| `gen_audio.py` / `build_audio.py` | 音频生成与注入，按 `--manifest` / `--target` 成对指定 |

## 已知覆盖缺口（todo）

铁律 6 要求**六个游戏**都验证"结算 + 落盘 + 刷新恢复"，目前只覆盖了 G3 / G4 / G5：

- **G1 声音抓抓乐**——每轮 8 题、每题 4 秒答题窗，还依赖音频播完才开窗
- **G2 积木合体**——逐词长按确认，词多、路径长
- **G6 计时闪卡**——要真实计时才产生纪录

这三个需要**在页面上下文里把音频播放替换成立即完成的确定性桩**才能稳定驱动。
补齐前请注意：**"冒烟全绿"目前不等于铁律 6 已验证**。（codex 首审 M-5，判定部分采纳）

另一个更彻底的备选（codex 复审 R-4 提出，本轮未采纳）：保留词扫描目前靠**枚举字段**，
可以改成"逐天渲染后克隆 DOM、移除 exam 节点、扫 textContent"——那样"可见文本"就是字面
意义的可见，不用维护字段清单。代价是要跑浏览器，会把数据自检和浏览器自检的边界搅浑。

`smoke_w2_browser.py` 仍是第二周专用（写死了 34 词、10/13 块积木架、紫色令牌值、
`soundblocks-w2-v1`）。第三周按规范 §5.1 改这些期望即可；`check_data.js` 不用改。

依赖：`node`、`python + playwright`（`pip install playwright && playwright install chromium`）。
