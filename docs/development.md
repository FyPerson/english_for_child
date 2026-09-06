# 长期维护指南

本文件与根目录 README 是工程流程入口。历史审查记录解释过去的决策，不替代当前源码与检查结果。

## 目录职责

| 目录或文件 | 职责 | 是否发布 |
|---|---|---|
| `project.json` | 正式周清单、合并入口包含的连续周次 | 否 |
| `frontend/src/weeks/` | 每周课程数据、页面结构与主题 | 否 |
| `frontend/src/shared/` | 状态、游戏、渲染、测评、触屏与解锁逻辑 | 否 |
| `frontend/src/media/weekNN/` | 已采用的音频／插画声明，供构建内嵌 | 否 |
| `resources/assets/` | 原始／处理素材、来源与授权记录 | 否 |
| `tools/` | 构建、素材处理、环境检查和发布工具 | 否 |
| `tests/unit/`、`tests/browser/`、`tests/fixtures/` | 自动测试与派生快照 | 否 |
| `tools/validation/`、`tools/legacy/` | 构建契约实现与历史移植工具 | 否 |
| `backend/` | 后端职责说明，当前没有服务实现 | 否 |
| `resources/manifests/`、`resources/reference/` | 素材清单和候选参考音源 | 否 |
| `test-results/` | 自动化截图，不提交 | 否 |
| `docs/` | 课程设计、工程说明、验收与历史决策 | 否 |
| 根目录 HTML | 为现有链接保留的生成课件；随源码一起版本管理 | 可单独使用 |
| `dist/<内容版本>/` | 仅包含可公开课件、入口和哈希清单 | 是 |
| `tmp/`、`.venv/` | 本机实验、依赖与临时结果；Git 忽略 | 否 |

`resources/reference/OpenLearn_Phonics_Audio/` 是候选音源目录，已迁移位置，未替换课件发音。`docs/design/design-doc.html` 是历史设计产物，不进入网站发布目录。

素材拆分保持原声明内容不变。每周播放器与部分主题样式仍保留在模板中；当前先稳定生产入口和发布边界，后续可以在播放回归保护下逐步统一，不能宣称已经完全消除重复代码。

## 新环境

推荐 Python 3.12、Node.js 22；代码最低要求 Python 3.10。可在项目内创建 `.venv` 并激活后安装：

```sh
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
python tools/project.py doctor
```

普通构建仅依赖 Python 标准库与 Node。Playwright 用于浏览器测试；声音／插画生成工具各自的外部依赖与凭据不属于普通构建，也不在 CI 中调用。Windows 旧 `tools/check.ps1` 保留了本机运行时回退，但团队流程不依赖个人缓存路径。

## 日常变更

1. 改课程内容：编辑对应 `weekNN.data.js`。改公共交互：编辑 `frontend/src/shared/`。不要直接修根目录生成 HTML。
2. `python tools/project.py build`：从源码展开全部课件，校验每周契约、脚本语法和合并脚本后写出。单个输出原子替换；多文件不承诺操作系统层面的事务。
3. `python tools/project.py check --quick`：检查生成一致性、数据、测评反例、媒体覆盖、配置及发布边界。
4. `python tools/project.py check`：交付前完整回归，包括真实浏览器的进度、六类游戏、测评、触屏、周导航与既有冒烟。
5. `python tools/project.py serve`：在本机 `127.0.0.1:8000` 查看发布目录。固定端口有助于复用同一来源下的进度；更换端口会形成另一来源。

课程内容、源码、生成 HTML 与相关测试应放在同一次提交。发布目录不提交。GitHub 工作流会检查已提交生成物是否过期；它不会替你构建后悄悄掩盖未提交的输出变化。本轮仅添加工作流文件，远程运行仍需将变更推送到 GitHub 后发生。

## 新增一周

1. 依据课程方案创建 `frontend/src/weeks/weekNN.data.js` 与模板，添加对应 `frontend/src/media/weekNN/` 的七份声明。复用已有 include，不复制展开后的 HTML；空素材声明会由覆盖检查发现缺项。
2. `META.week`、存储键、字位墙、题库、测评词池与每天检查项必须符合数据契约。已有存储键不能随意改名；需要结构升级时提供迁移与备份兼容测试。
3. 在 `project.json` 的 `weeks` 加入连续周号。构建会拒绝重复、缺号和模板清单不一致。
4. 只有准备好进入合并学习流程时，才扩展 `courseWeeks`。标题、导航和总天数由清单生成；不能跳过前面的周。
5. 通用测试默认检查所有已生成周；含具体教学机制的旧周冒烟是历史回归，不是后续新周的模板。新机制（例如 W5 双字母积木）需补针对性测试再装配。

## 换素材

现有媒体工具仍以 HTML 常量为注入接口，保留这条已使用的处理链：

```sh
# 按对应工具说明，先处理素材并更新 weekNN.html
node tools/capture_lesson_media.js weekNN.html
python tools/project.py build
python tools/project.py check
```

捕获工具只更新 `frontend/src/media/weekNN/*.js`，不会把生成游戏代码倒灌回模板。它先验证七项声明完整，再逐文件原子替换。来源和听检记录继续维护在素材文档中。自动检查只验证资源、字节和调用完整性，不替代人耳发音审核。

## 发布与回退

`python tools/project.py release` 依次构建、完整回归、输出本地发布目录。失败不继续打包。目录使用本机时间命名，如 `soundblocks-2026-09-05_14-30-00`；同秒有不同内容时追加序号，内容相同则复用已有目录。内容标识与每个文件的哈希仍记录在 `manifest.json`。`dist/最新版本.txt` 指向最近打包的目录（包括本地预览打包）。

只上传该目录中的文件，网站首页是 `index.html`。这条命令不登录托管商、不上传、不购买域名。回退时重新上传上一版目录。保持 HTTPS、域名和课件路径稳定；部署代码回退不等于回退浏览器中的学习记录。

合并入口的周锁是学习引导。独立周 HTML 仍作为可直接使用的教材一起提供，不构成防绕过或账号权限系统。

## 检查边界

CI 使用 Linux Chromium，本地完整回归在 Windows Chromium 验证。尚未运行的远程 CI、真实 Safari／微信浏览器和人耳试听，不能被写成已通过。不要因为测试绿色就更改已确认发音或删除原始素材。
