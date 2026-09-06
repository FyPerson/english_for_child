# 音素原始音源库

这里保存可供后续周次筛选、裁切和听检的原始音源，不是可以直接注入课件的成品。
`tools/build_phonemes.py` 只读取 `assets/phonemes/` 顶层，因此不会误把本目录的整段试听音注入页面。

## margo_heston · English Phonemes

- 来源：[Freesound 音包 12249](https://freesound.org/people/margo_heston/packs/12249/)
- 作者：margo_heston
- 授权：CC BY-NC 4.0（署名、非商业）
- 内容：43 段公开 HQ MP3 试听源；原作者上传名为 WAV，保存的是 Freesound 生成的 HQ MP3 试听版本
- 索引：`margo_heston-english-phonemes/manifest.json`（声音编号、标题、时长、来源链接、文件大小、SHA-256）
- 重新归档：`python tools/archive_margo_phoneme_pack.py`

使用某一段前，仍要按周次建立 `tools/phoneme_sources_wN.json`，记录具体切点和处理参数，并经过人耳听检。
这个音包本身没有 `/b/`，所以归档全包不会自动解决第三周 `b` 的音源问题；它主要用于后续音素复用和避免源文件再次丢失。

## TESSA · Teaching with Phonics Audio A1

- 来源：[OpenLearn Create 官方音频页](https://www.open.edu/openlearncreate/mod/resource/view.php?id=190145)
- 作者：TESSA / The Open University
- 授权：CC BY-NC-SA 4.0（署名、非商业、相同方式共享）
- 内容：12:38 的单字母音教学轨；第三周 `/b/` 取约 82.50–83.40 秒的第六次独立示范
- 原轨：`tessa-teaching-with-phonics/Teaching_With_Phonics_A1.mp3`
- 索引：`tessa-teaching-with-phonics/manifest.json`

2026-09-04 用户试听截取候选后确认采用。原轨只用于来源追溯和重新裁切，不能直接注入课件。
