# 已采用媒体声明

每周七个 JS 文件对应音素音频、词句音频、音素插画、词卡插画、字位墙、小书和庆祝图。它们由周模板的 include 在原位置展开，交付仍是全内嵌 HTML。

该目录保存课件实际采用的媒体；原始文件、后处理参数和来源仍在 `resources/assets/` 与素材 manifest 中。不要将候选长音轨自动替换为正式音素。

通过旧媒体工具更新 HTML 后运行 `node tools/capture_lesson_media.js weekNN.html`，再执行构建和回归。`test_media.js` 检查生成声明与这里逐字一致，并检查实际引用覆盖。
