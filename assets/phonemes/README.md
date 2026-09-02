---
状态: active（音素示范音资源包；跨周累积，逐周补齐）
source_of_truth: self（音频文件本身是真相源；页面里的 base64 是它的派生物）
日期: 2026-09-01
---

# 音素示范音资源包

孩子点字母积木时听到的**孤立音素**真人示范音。跨周累积——一个音素录一次，
后续所有周次复用，不重复采集。

**这是真相源**：周课件 HTML 里的 `PHONEME_AUDIO` 常量是由本目录的文件
经 `tools/build_phonemes.py` 注入生成的派生物。要改音，改这里再重新注入，
不要手改 HTML 里的 base64。

## 为什么必须是真人录音

自然拼读教孤立辅音时，`/k/` 必须是纯粹的爆破音，不能带元音尾巴。
TTS 合成和"从单词里切一刀"都极易得到 `kuh`、`duh` 这种**带 schwa 的错误示范**
——这是自然拼读公认的教学错误，孩子学了之后拼 `cat` 会念成 `kuh-æ-tuh`。

第一周因此选了真人录制的音素包，不用项目里现成的 TTS 管线。后续周次沿用这个判断。

## 当前覆盖

| 文件 | 字母 | IPA | 出现周次 | 来源 |
|---|---|---|---|---|
| `s.mp3` | s | /s/ | 第一周 | Freesound · margo_heston |
| `a.mp3` | a | /æ/ | 第一周 | 同上 |
| `t.mp3` | t | /t/ | 第一周 | 同上 |
| `i.mp3` | i | /ɪ/ | 第一周 | 同上 |
| `p.mp3` | p | /p/ | 第一周 | 同上 |
| `n.mp3` | n | /n/ | 第一周 | 同上 |
| `c.mp3` | c / k | /k/ | 第二周 | Freesound · margo_heston · `K.wav` |
| `e.mp3` | e | /e/ | 第二周 | Freesound · margo_heston · `Eh.wav` |
| `h.mp3` | h | /h/ | 第二周 | Freesound · margo_heston · `Hh.wav` |
| `r.mp3` | r | /r/ | 第二周 | Freesound · margo_heston · `Rr.wav` |
| `m.mp3` | m | /m/ | 第二周 | Freesound · margo_heston · `Mm.wav` |
| `d.mp3` | d | /d/ | 第二周 | Freesound · margo_heston · `D.wav` |
| — | g o u l f b | | 第三周·未开始 | 待采集 |

**别名**：第二周的 `k` 不单独录音，页面通过 `SOUNDS.k.audioKey = 'c'` 复用 `c.mp3`。
别名音**不要**在本目录放同名文件，`build_phonemes.py` 会拒绝。

缺音素时按**铁律 8**：页面不渲染听音按钮（降级要换元素类型，不是留个点不响的 button，
见 `docs/项目记忆/降级要换形态.md`）。

## 来源与许可

第一周六段剪自 Freesound 用户 **margo_heston** 的
[「English Phonemes」音包](https://freesound.org/people/margo_heston/packs/12249/)，
授权 **CC BY-NC 4.0**（署名 - 非商业）。已降噪并裁剪为纯音素段。

第二周六段也来自同一作者、同一音包的公开 HQ 试听流；先从发音前后的空段采样底噪，
做轻度频谱降噪（`/h/` 使用更温和的参数以保留送气），再裁成纯音素段，
转为 44100 Hz 单声道 64 kbps，并把峰值控制在 −4 到 −2 dBFS。
原文件分别是 `K.wav`、`Eh.wav`、`Hh.wav`、`Rr.wav`、`Mm.wav`、`D.wav`。
试听流是 MP3 派生文件，不是作者上传的原始 WAV；用于课件前仍需人耳确认没有 schwa 尾音。

**署名义务**：课件页脚必须保留出处链接。第一周的写法见 `week01.html` 的
`.foot__credits`，换周时不要漏掉这一段。**非商业授权** —— 这套课件不得用于商业分发。

> 第一周的原始 wav 已丢失，本目录的 mp3 是 2026-09-01 用
> `python tools/build_phonemes.py --target week01.html --extract-to assets/phonemes`
> 从已内嵌的 base64 无损取回的（六段逐个 sha256 比对，与页面内字节完全一致）。
> 以后不要再让源文件只存在于 HTML 里。

## 技术规格

所有文件统一为：

| 项 | 值 |
|---|---|
| 容器 / 编码 | MP3 / libmp3lame |
| 采样率 | 44100 Hz |
| 声道 | mono |
| 码率 | 64 kbps |
| 峰值 | −3 dBFS（容差 ±1 dB） |
| 首尾静音 | 已裁除（阈值 −40 dB） |
| 时长 | 0.13–0.73 s（合格区间 0.12–2.0 s） |

注意与**单词音**规格不同：单词音走 `tools/build_audio.py`，是 24000 Hz / 48k。
音素音要听清发音细节，所以规格更高。第一周六段约 24 KB；第二周补齐后十二段约 43.5 KB，
内嵌代价仍很小。

## 怎么加新音素

1. 拿到源音频（任何 ffmpeg 能解码的格式都行），**文件名 = 字母键**，放进本目录
   ——例如 `/k/` 的录音存成 `c.mp3`（不是 `k.mp3`，`k` 是别名）
2. 先干跑看处理结果：

   ```bash
   python tools/build_phonemes.py --target week02.html --src assets/phonemes --dry-run
   ```

3. 确认峰值 / 时长 / 覆盖都对，去掉 `--dry-run` 真正注入
4. **听一遍**。机器只能验证响度、时长、静音这些客观量，
   **验证不了"这个音发得对不对"**——那必须人耳过一轮
5. 补齐后记得更新上面的覆盖表

注入是**合并**语义：已有的键保留，同名键覆盖。所以给第二周注入时，
本目录同时放着第一周的六个也不会出问题（会原样重新注入，字节不变）。
