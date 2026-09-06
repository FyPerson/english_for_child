# 前端

`src/course.template.html` 是合并学习入口，`src/weeks/` 是周课程与页面，`src/shared/` 是公共交互，`src/media/` 是供构建内嵌的已采用媒体。

在仓库根运行 `python tools/project.py build`、`check`、`serve`。前端使用原生 HTML/CSS/JavaScript，当前不需要单独的 npm 安装步骤。进度保存在浏览器，未连接后端 API。

正式上传内容由 `dist/<版本>/` 给出；根目录 HTML 为现有本地打开路径保留。不要把 `frontend/src/` 作为网站根目录发布。
