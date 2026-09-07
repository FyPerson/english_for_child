# 资源

- `assets/`：原始／处理后的正式素材与来源记录，保留原有分类。
- `manifests/`：音频生成清单与音素来源／切点配置。

课件已经采用的内嵌媒体在 `frontend/src/media/`，由正式素材处理后进入构建。这个目录不直接发布到网站。

旧资料中的 `assets/` 和 `tools/audio_manifest*.json` 路径分别对应上述新位置；候选参考长音轨 `OpenLearn_Phonics_Audio/` 已于 2026-09-07 移出仓库（清单见 `docs/项目记忆/外部归档清单_20260907.md`），音素来源 TESSA 与 margo 两包保留在 `assets/phonemes/source-library/`。原始来源文档作为记录保留，当前操作路径以根 README 与 `docs/architecture.md` 为准。
