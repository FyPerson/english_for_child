# 工具入口

日常统一运行 `python tools/project.py <command>`：`doctor` 检查环境，`build` 构建，`check` 回归，`serve` 本地预览，`release` 生成经过回归的发布目录。

| 分类 | 文件 | 使用边界 |
|---|---|---|
| 构建 | `build_lessons.py`、`build_course.py`、`project_config.py` | 正式构建实现；合并内容来自源码 |
| 回归 | `run_checks.py`、`check.ps1`、`../tests/unit/`、`../tests/browser/` | 统一入口仍保留旧调用兼容 |
| 基线 | `baseline.py`、`validation/media_declarations.js` | 四周单文件基线的生成（`baseline --create`，干净树上一次）与比对（`check` 第 ③ 步）；重取须 `--force` 并单独提交 |
| 周主题色 | `theme_palette.py` | 从一个色相生成一周的第一层令牌（浅色加两处深色块）并按设计规范 §3.1 断言后写进模板；新周用 `--week N --hue H --name 名 --apply`，四周整套用 `--set A --apply` |
| 体量护栏 | `size_budget.py` | 按 `project.json` 的 `sizeBudgetMB` 检查 `build/` 下每个周文件与合并入口的字节数（十进制 MB，大于即失败）；放宽是一次拍板 |
| 发布核对 | `verify_manifest.py` | 按 `manifest.json` 逐文件核对发布目录；`package` 写完自检，CI release job 发布前同一检查 |
| 数据契约 | `validation/check_data.js`、`load_data.js`、`assessment_contract.js` | 教学引用、测评隔离、周次与素材契约 |
| 素材 | `gen_audio.py`、`build_audio.py`、`build_phonemes.py`、`prep_phonemes.py`、`embed_assets.py`、`unify_card_outlines.py` | 按各工具说明与对应 manifest 使用；可能有额外依赖 |
| 素材回收 | `capture_lesson_media.js` | 将已注入 HTML 的素材保存到 `frontend/src/media/` |
| 派生快照 | `extract_data_layer.py`、`validation/export_data.js` | 导出供检查／交接，不是课程源文件 |
| 历史专用 | `legacy/port*.py`、`w2data.py`、`w2days.py`、`archive_margo_phoneme_pack.py` | 仅历史追溯，不作为新周生产入口 |

旧细分工具路径已迁移，见 `docs/architecture.md` 的对照表；统一开发命令保持不变。新的通用工具必须进入统一入口并添加相关检查；不要再追加一个写死周号、机器目录和替换锚点的一次性生产脚本。
