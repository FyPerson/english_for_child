# tools/vendor/

第三方 vendor 代码，非本项目源码。

## acorn.js

- 用途：`tools/validation/js_ast.js` 用它做真正的 JS 解析（AST），供
  `tools/validation/load_data.js` 判定"哪些是顶层数据声明"（段 4 U1，2026-09-11，
  退役了此前基于正则 + 括号深度近似的 `tools/validation/js_lex.js` 路径）。
- 版本：8.14.0
- 来源：`https://cdnjs.cloudflare.com/ajax/libs/acorn/8.14.0/acorn.js`
- 下载日期：2026-09-11
- sha256：`bec194b9abb10147d3bb77e544d95cf1c7b4f9f42dad00dfc83791909ebf49c7`
- 许可证：MIT（见同目录 `acorn.LICENSE`）

**不要手工修改此文件**；升级方式 = 重新下载对应版本并更新本文件的版本号/哈希/日期。
