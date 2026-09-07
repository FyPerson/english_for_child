# 项目目录与职责

```text
english_for_child/
├─ frontend/                 前端应用
│  └─ src/
│     ├─ course.template.html 合并课程入口
│     ├─ weeks/              周课程数据与页面
│     ├─ shared/             游戏、进度、测评、触屏、解锁
│     └─ media/              已采用的内嵌音频和插画
├─ backend/                  后端职责说明；当前没有后端实现
├─ resources/
│  ├─ assets/                原始及处理素材、来源记录
│  ├─ reference/             候选音源
│  └─ manifests/             音频清单和处理配置
├─ tests/
│  ├─ unit/                  构建、媒体、契约检查
│  ├─ browser/               Playwright 浏览器回归
│  └─ fixtures/              派生课程快照
├─ tools/
│  ├─ project.py             开发命令入口
│  ├─ validation/            构建时的数据读取和契约校验
│  └─ legacy/                旧周移植脚本，仅供历史参考
├─ docs/
│  ├─ design/                历史设计页面
│  └─ archive/screenshots/   历史人工验收截图
├─ test-results/             自动化截图等临时产物，不提交
├─ dist/                     按内容版本隔离的发布包，不提交
├─ tmp/                      本机实验与缓存，不提交
├─ .github/workflows/        自动回归配置
├─ project.json              正式周与合并范围清单
└─ build/                    构建产物（course.html、index.html、weekNN.html），不提交
```

Python 脚本目前只负责构建、处理资源、验证和本机预览，因此放在 `tools/`。`backend/` 尚无服务，等真正需要账号、同步和数据库时再实现。前端的浏览器本地进度仍属于前端状态。

构建时必须使用的契约读取器在 `tools/validation/`，验证这些契约的测试在 `tests/unit/`；两者不再混在一起。生成 HTML 只在 `build/`（不提交），正式网站只上传 `dist/<版本>/` 内文件。

## 旧路径迁移表

| 原路径 | 当前位置 |
|---|---|
| `src/` | `frontend/src/` |
| `assets/` | `resources/assets/` |
| `OpenLearn_Phonics_Audio/` | `resources/reference/OpenLearn_Phonics_Audio/` |
| `tools/audio_manifest*.json`、`tools/phoneme_sources_w3.json` | `resources/manifests/` |
| `tools/week-checks/test_*.py`（浏览器测试） | `tests/browser/` |
| `tools/week-checks/test_build.py`、JS 测试 | `tests/unit/` |
| `tools/week-checks/smoke_*.py` | `tests/browser/` |
| `tools/week-checks/*-data.js` | `tests/fixtures/` |
| `tools/week-checks/check_data.js` 等校验实现 | `tools/validation/` |
| `tools/week-checks/port*.py`、`w2data.py`、`w2days.py` | `tools/legacy/` |
| `screenshots/reliability-mobile/` | `test-results/screenshots/reliability-mobile/` |
| 其他旧 `screenshots/` | `docs/archive/screenshots/` |
| `design-doc.html` | `docs/design/design-doc.html` |

旧审查记录和素材来源记录保留当时路径，用本表定位；当前 README、维护指南、工具调用和 CI 使用新路径。
