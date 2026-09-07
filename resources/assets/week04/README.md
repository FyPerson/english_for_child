# 第四周素材

只有 `word-cards/` 下五张 2026-09-07 用 codex 订阅 image_gen（gpt-5.6-sol）补生成的词卡原图（1024 px 白底 PNG）：dan、nat、nap、rag、pats。提示词、参考图、规格化参数与成品 sha256 见 `docs/插画生成提示词_第四周补图_20260907_v1.0.md`。

**不要对第四周运行 `python tools/embed_assets.py --assets resources/assets/week04`。** 该工具按目录全量重建四类插画常量，而第四周其余插画没有文件源（只存在于 `frontend/src/media/week04/*.js`），全量重建会把它们清空。这五张卡是用去白底（只抠与画布边缘连通的白色）加 `unify_card_outlines.unify` 规格化后直接追加进 `frontend/src/media/week04/word_ill.js` 的；工程健康化第 1 期把插画导出到 `resources/adopted/` 后，这个目录按新管线处理。
