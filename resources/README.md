# 资源

- `assets/`：原始／处理后的正式素材与来源记录，保留原有分类。
- `reference/OpenLearn_Phonics_Audio/`：候选参考长音轨，仅迁移位置，没有替换课件发音。
- `manifests/`：音频生成清单与音素来源／切点配置。

课件已经采用的内嵌媒体在 `frontend/src/media/`，由正式素材处理后进入构建。这个目录不直接发布到网站。

旧资料中的 `assets/`、`OpenLearn_Phonics_Audio/` 和 `tools/audio_manifest*.json` 路径，分别对应上述新位置。原始来源文档作为记录保留，当前操作路径以根 README 与 `docs/architecture.md` 为准。
