---
状态: active（音素示范音资源包；跨周累积，逐周补齐）
source_of_truth: self（音频文件本身是真相源；页面里的 base64 是它的派生物）
日期: 2026-09-03（第三周六段已注入；b 曾是候选、现已注入，仍有元音尾风险，见下）
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
| `g.mp3` | g | /g/ | 第三周 | Freesound · margo_heston · `G.wav` |
| `o.mp3` | o | /ɑ/ | 第三周 | Freesound · margo_heston · `Ahh.wav`（作者标 "dark a"；`Aah.wav` 是 /æ/，第一周 a 已用） |
| `u.mp3` | u | /ʌ/ | 第三周 | Freesound · margo_heston · `Uh.wav` |
| `l.mp3` | l | /l/ | 第三周 | Freesound · margo_heston · `Ll.wav` |
| `f.mp3` | f | /f/ | 第三周 | Freesound · margo_heston · `Ff.wav` |
| `b.mp3` | b | /b/ | 第三周 | Freesound · **ipapronunciations** · `[b] - Voiced bilabial plosive.wav`（CC0；切自 "ba"，用户 2026-09-03 听页面后拍板注入，见下） |

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

第三周（2026-09-03）取法与第二周相同：同一音包的 HQ 试听流 → 频谱门限降噪 → 按频谱定切点裁段。
不同的是这次把**来源、切点、降噪参数全部写进 `tools/phoneme_sources_w3.json`**，由
`tools/prep_phonemes.py` 复跑，再交 `tools/build_phonemes.py` 规格化注入；每个音为什么取那一段
（例如 o 为何取 `Ahh.wav` 不取 `Aah.wav`）也记在那个清单里。五段来自 margo_heston：
`G.wav`、`Ahh.wav`、`Uh.wav`、`Ll.wav`、`Ff.wav`。

**/b/ 是来源例外**：margo_heston 的音包 43 段里没有 B（有 Pp、D、G、K）。唯一找到的真人替代来源是 Freesound 用户
**ipapronunciations** 的[「IPA Pulmonic Consonants」音包](https://freesound.org/people/ipapronunciations/packs/35572/)
（[sound 640377](https://freesound.org/people/ipapronunciations/sounds/640377/)，CC0 1.0，内容是 "ba, aba"），
只能从 "ba" 里切出预浊音 + 爆破 + 约 60 ms 元音起始——正是上文说的"从单词里切一刀"，元音尾压不到零，
还换了发音人。codex 审（`docs/codex审查记录/21-第三周音素音.md` C-1）判为触及硬约束，先退为候选不注入；
**2026-09-03 用户听页面后拍板提升注入**（页面 b 没有声音比带一点元音尾更影响本周教学）。这是十八段里唯一
非 margo_heston 的一段，也是最需要课上盯着孩子模仿效果的一段：若孩子跟着念成 "buh"，按下面「候选目录」
的退回三步（一条 `--remove b` 命令）退回家长口令，或自录一段 /b/ 覆盖 `b.mp3`。

## 候选目录 `candidates/`

放"取到了但没过关"的切音（目前为空；b 曾在此，2026-09-03 提升后删除），**`build_phonemes.py` 只扫本目录顶层文件，不会扫到子目录**，所以放这里不会被注入。
听检通过要注入时，用一个**只含这一个候选**的临时目录（`--clean` 会先清空该目录的顶层与 `candidates/`，
`prep_phonemes.py` 结束时还会把两处里不是本次生成的 `.wav` 当残留报错，防止旧候选混进注入）：

```bash
python tools/prep_phonemes.py --spec tools/phoneme_sources_w3.json --out tmp/b_only --key b --include-candidates --clean
python tools/build_phonemes.py --target week03.html --src tmp/b_only/candidates
# 然后把 tmp/phonemes_build/b.mp3 复制到本目录，删掉 candidates/b.wav，更新上表
```

不通过就自录一段 /b/（文件名 `b.wav`），走同一条注入命令。

**退回**（已注入的音在课上发现教歪了）：注入是合并语义，把源文件拿走或把清单里 `inject` 改 false
**都不会删掉已内嵌的键**，必须显式删：

```bash
python tools/build_phonemes.py --target week03.html --remove b        # 只删 PHONEME_AUDIO 里的 b，页面 b 回到家长口令
# 再把 b.mp3 移进 candidates/、清单里 inject 改 false，防止下次注入又合并回来
```

`--remove` 与 `--src` 互斥、键必须已内嵌、支持 `--dry-run`。

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
第三周补齐后十八段约 61.9 KB，内嵌代价仍很小。

## 怎么加新音素

1. 拿到源音频（任何 ffmpeg 能解码的格式都行），**文件名 = 字母键**，放进本目录
   ——例如 `/k/` 的录音存成 `c.mp3`（不是 `k.mp3`，`k` 是别名）。
   若源是 Freesound 试听流，照第三周的做法：把来源与切点写进一份 `tools/phoneme_sources_wN.json`，
   跑 `python tools/prep_phonemes.py --spec 那份清单 --out tmp/phonemes_stage --clean`
   （清单里写试听流的 sha256 与字节数，脚本会校验；每个键打印分带能量变化，可设 `guard` 护栏），
   拿 `tmp/phonemes_stage` 当下一步的 `--src`，注入后把 `tmp/phonemes_build/<键>.mp3` 复制进本目录
2. 先干跑看处理结果：

   ```bash
   python tools/build_phonemes.py --target week03.html --src assets/phonemes --dry-run
   ```

   目标 HTML 必须声明源目录里每个文件的键（自检 3 会拦）。本目录跨周累积，
   **给早前周次重注入时要用只含该周已声明键的临时目录**，直接指向本目录会因为多出的新键失败。

3. 确认峰值 / 时长 / 覆盖都对，去掉 `--dry-run` 真正注入
4. **听一遍**。机器只能验证响度、时长、静音这些客观量，
   **验证不了"这个音发得对不对"**——那必须人耳过一轮
5. 补齐后记得更新上面的覆盖表

注入是**合并**语义：已有的键保留，同名键覆盖。源目录若只含目标周已声明的键
（例如只有第一、二周文件时给 week02 注入），早前周次的文件会原样透传、字节不变；
但本目录是跨周累计的，现在还含第三周键，给第二周重注入仍须用筛选后的临时目录（见上文第 2 步）。
