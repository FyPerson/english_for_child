# 周课件检查

`unit/` 存放构建、目录、媒体和测评契约测试；`browser/` 存放所有浏览器回归；`fixtures/` 存放派生数据快照。构建使用的校验实现位于 `tools/validation/`，旧移植脚本归 `tools/legacy/`。自动截图输出到 `test-results/screenshots/`。

新开发入口统一为 `python tools/project.py check`：先构建到 `build/`，再在临时目录重建一次逐文件比对（可重现构建），然后对照单文件基线，最后跑单元与浏览器套件。生成物不入库，测试一律读 `build/` 下的产物。以下旧命令继续兼容。生产目录与发布流程见 `docs/development.md`。

当前统一入口：Windows 运行 `./tools/check.ps1`，其他环境运行 `python tools/run_checks.py`。需要 Node.js、Python 3.10+ 和 `requirements-dev.txt` 中的 Playwright；浏览器安装命令 `python -m playwright install chromium`。

`--quick` 仅运行生成物、数据、语法、契约反例与媒体覆盖检查，会明确显示浏览器检查被跳过。

| 文件 | 范围 |
|---|---|
| `browser/test_initialpick.py` | W1 第七天与 W3 首字母游戏：重听、答错重试、答对后揭示、整轮完成、折叠取消和触屏 |
| `test_build.py` | 清单异常、include 路径／循环、合并失败不覆盖 `build/` 旧周、发布白名单与内容哈希、缺件即报、`verify_manifest` 对篡改／多余／缺失文件的拒绝 |
| `test_baseline.py` / `fixtures/baseline_20260907.json` | 四周单文件基线：骨架哈希、声明顺序、逐键媒体字节；可证伪四类与引用形态拒绝；`baseline --create` 只在干净树上生成且不覆盖，`build` 与 `check` 只读它。基线不匹配时先确认改动是有意的，再单独一个 commit 跑 `python tools/project.py baseline --create --force` 重取 |
| `test_course.py` | 左侧周导航、手机折叠、整周与逐日锁、撤销后重锁、保存失败、HTTP 旧进度与离线切换 |
| `check_data.js` / `load_data.js` | W1—W4 数据、引用、时长、词卡墙、积木架；读取 HTML 或数据 JS |
| `assessment_contract.js` | W4 起的保留词／复测／探针／全年词池隔离，巩固周与月测短文 |
| `test_assessment_contract.js` | 合法样例与 16 个反例，验证错误真的被拦住 |
| `test_progress.py` | 四周损坏进度、写入失败／重试、刷新、备份往返、文件选择导入、跨周／版本拒绝 |
| `test_games.py` | 四周 G1—G6 精确结算、落盘／刷新恢复；失败重试、撤回、取消长按、快闪退出 |
| `test_assessment_browser.py` | W4 测评词未揭示前不进 DOM、禁点读、十词门槛、阅读错误率与提示、备份 |
| `test_media.js` | 课程实际使用的词句录音与全部音素别名内嵌；跨周音素字节一致 |
| `test_mobile.py` | HTTP + 320/390/768/1280px，所有日页、可见图片、触屏摆放／撤回、离线导航 |
| `smoke_parent_panel.py` | 每周 27 项鼠标、键盘、触摸滑动取消、日期与重置（默认所有周） |
| `smoke_w2_browser.py` / `smoke_w3_browser.py` | 保留的周专用旧冒烟，仍参与完整回归 |
| `export_data.js` / `tools/extract_data_layer.py` | 导出派生数据快照，课程编辑入口在 `frontend/src/weeks/` |

G1/G2/G6 的旧覆盖缺口已经补齐。浏览器虚拟时钟用于确定性驱动，并不替代真实音频设备测试；音频桩不证明发音准确。

`port.py`、`port_w3.py`、`w2data.py`、`w2days.py` 留作历史移植记录，不能用来生成第四周或覆盖共享引擎。`week02-data.js`、`week03-data.js` 是可再导出的交接快照，不参与构建。

第一周的历史差异在数据校验中明确保留：周检含一个四字母词；G1 全部是只听后反馈的题材，允许尚未教学的字母；认读词独立提供词义，Nat 是原书专名。这些例外不放宽 W4 的 CVC 与测评隔离要求。

物理设备仍需验证：iPhone/iPad Safari 和 Android Chrome 首次播音、连续播放、切后台、锁屏、触摸缩放、备份下载与恢复。
