# 周课件自检脚本

配合 `docs/声音积木周课件设计规范_20260831_v1.0.md` §13 冒烟清单使用。
所有脚本都从**自身位置**推导仓库根，可用命令行传目标；运行时先打印最终解析路径。

| 文件 | 作用 | 跑法 |
|---|---|---|
| `check_data.js` | 数据层一致性 **360 项**。**与周次无关**——跨周会变的量（已教字母集、词卡墙词数、认读词、积木架、点亮墙字母）全部由数据推导或从 `META` 读，第三周原样可用 | `node tools/week-checks/check_data.js <周课件HTML 或 数据层JS>` |
| `smoke_w2_browser.py` | 浏览器冒烟 **97 项**：逐天展开无 undefined / 缺素材降级（配对式断言）/ 关键组件 / 词卡墙 / 明暗主题 / 窄屏 / G3·G4·G5 结算+落盘+刷新恢复 | `python tools/week-checks/smoke_w2_browser.py [目标HTML]` |
| `week02-data.js` | 第二周数据层（由 `tools/extract_data_layer.py` 抽出）。**给外部模型当范例**，也是 `check_data.js` 的独立输入样本 | 见 `docs/第三周数据层交接_*.md` |
| `port.py` + `w2data.py` + `w2days.py` | 第一周 → 第二周的换数据层移植脚本，77 项锚点替换全部断言唯一命中 | 已执行完毕，留档备查 |

## check_data.js 吃两种输入

```bash
node tools/week-checks/check_data.js week02.html                       # 装配好的周课件
node tools/week-checks/check_data.js tools/week-checks/week02-data.js  # 独立数据层
```

两种输入结果一致（实测都是 360 项）。**后一种是给外部模型用的**：GPT 写完第三周数据层，
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
