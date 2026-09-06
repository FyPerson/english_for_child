# 声音积木

项目分为 `frontend/` 前端、`backend/` 后端边界说明（尚无实现）、`resources/` 素材、`tests/` 测试、`tools/` 构建和 `docs/` 文档。完整目录与旧路径对照见 [项目结构](docs/architecture.md)。

给孩子与家长共同使用的自然拼读课件。每周一个可离线打开的 HTML，也可以直接通过 HTTPS 静态网站访问。进度保存在当前浏览器，支持逐周 JSON 备份与恢复。

## 使用

- 推荐入口：`course.html`，前三周合并版。桌面左侧周次导航、手机可展开目录；当天所有打卡保存成功才开放下一天，前一周全部完成才开放下一周（包括总览）。锁定周显示解锁条件，不能进入。
- 撤销早期打卡会重新锁定后续课程，但不删除后续记录。同一来源下沿用原周存储键；本地文件的存储隔离因浏览器而异，旧进度未显示时请用原周课件导出，再到合并版对应周家长设置导入。
- 第一至三周：`week01.html`、`week02.html`、`week03.html`。
- 第四周：`week04.html`，巩固 19 块积木、复读三本小书、十词基线和月测阅读。
- 家长设置：页脚按住 1.5 秒。可设日期、导出备份、导入本周备份、长按重置。
- 保存失败会显示提示；换设备、换浏览器、从本地迁移到域名之前，先导出备份。

## 开发与检查

源码位于 `frontend/src/`；根目录课件是生成物，不再作为公共引擎的编辑入口。使用 Python 3.10+、Node.js、Playwright：

```powershell
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
python tools/project.py doctor
python tools/project.py build
python tools/project.py check
```

周清单与合并范围由 `project.json` 声明。构建先校验全部周和合并入口，再写入生成物；单周构建也会同步合并版，合并内容直接来自源码。合并入口源码为 `frontend/src/course.template.html`，解锁适配为 `frontend/src/shared/course-bridge.js`。家长打卡是完成依据，解锁属于学习引导，不是防篡改权限系统。

`python tools/project.py check --quick` 做生成一致性、数据、语法、契约、媒体和构建边界检查，明确跳过浏览器测试。旧 `tools/check.ps1`、`tools/run_checks.py` 入口继续可用。

```powershell
python tools/project.py serve --port 8000 # 构建后仅预览发布文件，不暴露整个仓库
python tools/project.py release           # 构建、完整回归、生成 dist/<内容版本>/
```

`release` 只准备本地文件，不上传。版本目录使用 `soundblocks-日期_时间` 命名，`dist/最新版本.txt` 指向最近打包版本。将版本目录内的文件上传到静态主机即可。`manifest.json` 记录各文件 SHA-256，旧版本目录保留以便回退。完整开发流程见 [长期维护指南](docs/development.md)。

| 内容 | 编辑位置 |
|---|---|
| 存储、备份、日期、家长设置 | `frontend/src/shared/state.js`、`progress.js` |
| 测评隔离与界面 | `frontend/src/shared/assessment.js`、`tools/validation/assessment_contract.js` |
| 六个游戏与小书阅读器 | `frontend/src/shared/games.js` |
| 内容块渲染 | `frontend/src/shared/render-blocks.js` |
| 长按与移动端样式 | `frontend/src/shared/longpress.js`、`mobile.css` |
| 每周课程、题库、积木架、计时上限 | `frontend/src/weeks/weekNN.data.js` |
| 每周主题、首页与既有播放层 | `frontend/src/weeks/weekNN.template.html` |
| 已采用的内嵌媒体声明 | `frontend/src/media/weekNN/*.js` |
| 构建周清单与合并范围 | `project.json` |

播放总线和每周首页仍保留在各自模板中；此次没有重写已经审核过的底层播放协议。共同的游戏和状态实现由同一份源码构建。

现有音频／插画工具仍可更新根目录课件。更新后运行 `node tools/capture_lesson_media.js weekNN.html`，只把素材同步回 `frontend/src/media/weekNN/`，再构建检查。原始素材与出处保留在 `resources/assets/`，不改变已采用的发音。不要用历史 `port.py` / `port_w3.py` 生成新周。

## 详细说明

- [工程、测试与网站部署](docs/工程与交付规范_20260905_v1.0.md)
- [第四周学习设计](docs/第四周学习设计_20260905_v1.0.md)
- [课程总方案](docs/声音积木六年课程方案_20260902_v1.3.md)
- [项目现状与交接](docs/项目记忆/README.md)

自动化验证不能代替音素的人耳听检，也不能代替真实 iPhone／iPad 的扬声器与 Safari 验证。
