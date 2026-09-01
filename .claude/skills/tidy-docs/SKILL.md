---
name: tidy-docs
description: 校验项目文档（默认 docs/local）是否符合「文档与记忆体系管理规范」并修复落位问题。仅在用户显式运行 `/tidy-docs`、或 remember 收尾检测到本次会话有文档变更并经用户确认时使用。自适应探测项目结构，检查命名/位置/引用/frontmatter/_originals 五项，缺对应结构的校验项自动跳过。发现违规先提示再问用户是否修，不自动改文件。
disable-model-invocation: true
---

# tidy-docs（全局跨项目）

按「文档与记忆体系 · 管理规范」校验项目文档落位，发现违规先报告再问用户是否修复。**全局 SKILL，自适应探测各项目结构**。

**权威源（两层）**：
- **全局方法论**：`C:/Users/FY/.claude/shared-memory/doc_memory_governance_spec.md`（六原则 + 信息治理 + 触发机制，跨项目通用）
- **项目实例**（若有）：项目 CLAUDE.md 或项目级实例规范声明的"本项目文档结构"（顶层常驻文件名、模块清单、_originals 约定、历史例外清单、备份目录）。项目实例**补充/覆盖**全局，校验时项目实例优先。

## 非目标

- **不自动触发**：不因为 Claude 觉得"文档可能乱了"就跑。只在显式 `/tidy-docs` 或 remember 收尾经用户确认时启动。
- **不自动改文件**：所有修复必须先报告 + 给建议 + 等用户拍板（与 remember "所有修改需确认"一致）。
- **不碰历史快照**：worklog session 是历史快照，本 SKILL 只管项目文档结构，不改 session 原文。
- **不重复造体检**：若项目已有 `health` 类 SKILL（代码/服务健康检查），本 SKILL 只管文档落位，不查代码/服务。

## 模式

| 调用 | 模式 | 范围 |
|---|---|---|
| `/tidy-docs` | **全量模式** | 全项目文档目录落位 + 断链体检 |
| `/tidy-docs <路径>` | 局部模式 | 只校验指定文件/目录 |
| remember 收尾调用（`收尾模式`参数） | **收尾模式** | 只校验本次会话碰过的文档（轻量、快） |

> 收尾模式由 remember SKILL 第 13 步之后调用，传入"本次会话新建/移动/改名的文档清单"。无文档变更则不调用。

## ⭐ 自适应探测（每次启动必做，第 0 步）

全局 SKILL 不能假设项目结构。**启动时先探测项目实际有什么**，决定哪些校验项跑、哪些跳过：

```bash
# 在项目根（当前工作目录）跑探测。用 shell test，中文路径友好。
ROOT="$PWD"   # 或当前项目工作区根

# [探测1] 文档目录：docs/local > docs > 项目根 .md
if   [ -d "$ROOT/docs/local" ]; then DOCDIR="docs/local"
elif [ -d "$ROOT/docs" ];        then DOCDIR="docs"
elif ls "$ROOT"/*.md >/dev/null 2>&1; then DOCDIR="."
else DOCDIR=""   # 无文档目录 → 全部跳过
fi

# [探测2] 归档目录（位置校验用）
[ -d "$ROOT/$DOCDIR/_archive" ] && HAS_ARCHIVE=1 || HAS_ARCHIVE=0

# [探测3] _originals / 审查记录目录（校验5用）
ORIGDIR=$(find "$ROOT/$DOCDIR" -type d -name '_originals' 2>/dev/null | head -1)
[ -n "$ORIGDIR" ] && HAS_ORIGINALS=1 || HAS_ORIGINALS=0

# [探测4] 是否有 frontmatter 方案文档（校验2位置判断/校验4 用）
HAS_FM=$(grep -rl '^source_of_truth:' "$ROOT/$DOCDIR" --include='*.md' 2>/dev/null | head -1)
```

**探测结果 → 校验项启停**：

| 探测 | 结果 | 影响 |
|---|---|---|
| 无文档目录（DOCDIR 空） | — | **全部跳过**，一句"本项目无文档目录，tidy-docs 跳过" |
| 有文档目录 | DOCDIR | 校验 1（命名）+ 校验 3（引用）**必跑**（普适） |
| 有模块子目录 / frontmatter 文档 | HAS_FM | 校验 2（位置）+ 校验 4（frontmatter）跑 |
| 无 frontmatter 文档 | — | 校验 2 降级为只看顶层常驻 / 校验 4 跳过 |
| 有 _originals 目录 | HAS_ORIGINALS=1 | 校验 5（_originals）跑 |
| 无 _originals 目录 | HAS_ORIGINALS=0 | 校验 5 跳过 |

**读项目实例**：探测后，读项目 CLAUDE.md 找"文档结构实例"段（顶层常驻文件清单、模块清单、历史例外清单、备份目录）。找不到则用全局默认（顶层只校验"有没有明显的状态后缀文件裸放"，不强求 3 常驻；无历史例外清单则不跳过任何文件，但报告时标"未声明历史例外，以下疑似项请人工确认"）。

## 五项校验（对齐规范六原则）

每项标注它对应规范哪条 + 怎么查 + **何时跳过**。

### 校验 1：命名（规范原则 1）—— 普适，必跑
- **查**：文件名是否含状态后缀（`_已上线`/`_已归档`/`_草案` 等会变的状态）
- **判**：状态不该进文件名（用目录位置 + frontmatter `status` 表达）
- **例外**：项目 CLAUDE.md 声明的历史例外清单 → 跳过不报
- **命令**：`ls $DOCDIR/<本次目录>/ | grep -E '_已上线|_已归档|_草案'`（排除项目声明的历史例外）

### 校验 2：位置（规范原则 1 + 4）—— 有模块结构才跑
- **查**：① 文档目录顶层是否只有项目声明的常驻文件 ② 方案文档是否归在模块子目录 ③ frontmatter `status` 与目录位置是否一致（`_archive/` 里不该有 `active`；模块目录里 `archived` 该移走）
- **跳过**：项目无模块子目录约定（CLAUDE.md 未声明常驻清单）→ 只查 status 与 `_archive/` 位置一致性，不强求顶层只 N 个
- **命令**：`ls $DOCDIR/*.md`（对比项目声明的常驻清单）；对本次文档读 frontmatter status 比对所在目录

### 校验 3：引用（规范原则 2 + 引用同步）—— 普适，必跑
- **查**：本次新建/移动/改名的文档，所有指向它的引用 + 它自身的外链，是否都解析到真实文件
- **关键**：用脚本**逐个 test -e** 验证，不靠规则推理（移动可能让原本就错的链接"歪打正着"变对/变错）
- **命令**：见下方"引用验证脚本"

### 校验 4：frontmatter（规范原则 6）—— 有 frontmatter 文档才跑
- **查**：方案/规范类文档（`*_方案_*.md`/`*规范*.md`）是否有完整 frontmatter（含 `status` + `source_of_truth`）
- **判**：`source_of_truth` 权威文件写 `self`、非权威写路径；缺 frontmatter 的方案类文档报出来
- **跳过**：项目无 frontmatter 惯例（探测 HAS_FM 空）→ 跳过；轻量文档（探查报告/临时记录）允许只第一行 `状态:`，不强制

### 校验 5：_originals 归档（审查记录约定）—— 有 _originals 才跑
- **查**：① `_originals/` 里有没有非 `.final.txt`（约定只收 `.final.txt`）② 审查记录 `.md` 链接的 `.final.txt` 是否都真在 `_originals/`（防漏档）
- **跳过**：项目无 `_originals/` 目录（探测 HAS_ORIGINALS=0）→ 整项跳过
- **命令**：见下方"_originals 验证脚本"

## 执行流程

1. **第 0 步自适应探测**（见上）：确定 DOCDIR + 哪些校验跑。无文档目录 → 直接报"跳过"结束。
2. **抛路径确认块**（收尾模式跳过，已由 remember 传入清单）：
   > 📍 **tidy-docs 校验范围**
   > - 项目：<当前项目>（文档目录：<DOCDIR>）
   > - 模式：全量 / 收尾（本次 N 个文档）
   > - 跑校验：<根据探测列出哪几项跑、哪几项跳过 + 原因>
3. **跑适用的校验**（收尾模式只对本次文档跑校验 1-4 + 全局快扫校验 3/5 的断链）
4. **汇总报告**：按"✓ 通过 / ✗ 违规 / ⊘ 跳过（原因）"列出。违规项标明：哪个文件 + 违反哪条规范 + 建议怎么修
5. **逐项问用户是否修**（违规项才问；全通过则一句"N 个文档落位检查通过"）：
   - 每条违规给"💡 建议修法 + 理由"，等用户"修/不修/改法"
6. **用户确认后才改**：改完**重新 test -e 验证**目标存在（不靠推理）
7. **改完报告**：列出改了什么 + 验证结果

## 引用验证脚本（校验 3 核心）

```bash
# 验证某文档的所有相对链接 + 指向它的入链，逐个 test -e
# $1 = 要验证的文档路径（相对 DOCDIR）；DOCDIR 由第 0 步探测得出
cd "$PWD/$DOCDIR"
f="$1"; dir=$(dirname "$f")
# A. 该文档自身的外链
grep -aho '\]([^)]*)' "$f" 2>/dev/null | sed 's#\](##;s#)$##' | while read t; do
  case "$t" in http*|C:/*|\#*|*\<*\>*|*:docs/*|*\${*|*{*}*) continue ;; esac
  c=$(echo "$t" | sed 's/#.*//;s/ .*//'); [ -z "$c" ] && continue
  [ -e "$dir/$c" ] || echo "✗ 外链断: [$f] → $c"
done
# B. 指向该文档的入链（全 DOCDIR 搜文件名）
fn=$(basename "$f")
grep -rln "$fn" --include='*.md' . 2>/dev/null | while read ref; do
  echo "↪ 入链来源: $ref（确认其指向 $fn 的路径是否还对）"
done
```

> ⚠️ 中文路径用 shell `test -e`，**不要用 Python `os.path.exists`**——它在 Git Bash(MSYS2) 下对中文路径全部误判失效（2026-06-12 踩坑）。

## _originals 验证脚本（校验 5 核心，仅 HAS_ORIGINALS=1 时跑）

```bash
# REVDIR = 审查记录根（_originals 的祖父目录）。下例假设审查记录在 $DOCDIR/codex审查记录
REVDIR=$(dirname "$(dirname "$ORIGDIR")")
cd "$REVDIR"
# ① 有没有非 .final.txt 混入——排除两类合理特例：
#    a. 调用过程产物（.json/.prompt.txt/.raw.jsonl）= 真违规，该清
#    b. transcript 重建档案 / "已清理说明"档案（早期手工审无 final.txt 来源）= 合理特例，跳过
find . -path '*/_originals/*' -type f ! -name '*.final.txt' 2>/dev/null | while read f; do
  case "$f" in *.json|*.prompt.txt|*.raw.jsonl) echo "✗ 过程产物混入: $f"; continue ;; esac
  if head -1 "$f" 2>/dev/null | grep -qE 'transcript 重建|已被清理|无原始 final'; then
    : # 合理特例，跳过
  else
    echo "? 非 .final.txt 且无特例说明: $f（人工确认是不是该规整命名）"
  fi
done
# ② 审查记录链接的 .final.txt 是否都在——排除 xxx/codex_xxx 模板占位符
find . -name '*.md' | while read f; do dir=$(dirname "$f")
  grep -oE '\]\(_originals/[^)]*\.final\.txt\)' "$f" 2>/dev/null | sed 's#](##;s#)##' | while read rel; do
    case "$rel" in *xxx*|*codex_xxx*) continue ;; esac  # 模板占位符，跳过
    [ -e "$dir/$rel" ] || echo "✗ 漏档: [$f] → $rel"
  done
done
```

> **倒灯踩坑（2026-06-12）**：首版校验 5 把"transcript 重建档案"和 README 里的 `xxx` 模板占位符都误报为违规。教训——`_originals/` 里非 `.final.txt` 不一定是问题（有早期手工审重建档案的合理特例），占位符 `xxx` 要排除。校验脚本宁可"先标 `?` 让人工确认"，不要"一律报 `✗`"。

## 修复动作映射（发现违规 → 怎么修）

| 违规 | 修法（需用户拍板） |
|---|---|
| 文件名含状态后缀 | 去后缀改名 + 同步所有引用（规范引用同步）；项目声明的历史例外不动 |
| 草案/方案裸顶层 | 移到对应模块子目录 + 同步引用 |
| frontmatter status 与目录冲突 | `_archive/` 的 active → 改 status 或移回；模块目录的 archived → 移 `_archive/` |
| 引用断链 | 文件还在→改引用指真实位置；文件已删→引用改纯文本历史提及 |
| 缺 frontmatter | 按规范原则 6 模板补 |
| _originals 混入 .json 等 | 先确认有无 .md 链接它（有→改指 .final.txt）→ 删非 .final.txt |
| _originals 漏档 | 临时目录(`%TEMP%/codex-bridge-workspace/runs/`)找回 .final.txt 补进去；找不到→链接改纯文本 |

## 约束

- **只读不写**直到用户拍板修复。
- **所有修复改完用 `test -e` 验证目标存在**，不靠规则推理。
- **中文路径一律用 shell `test -e`**，禁用 Python `os.path.exists`。
- **历史例外 / 已知历史断链**由项目 CLAUDE.md 声明 → 报告时标"项目声明历史例外，非本次"，不强制修。项目未声明 → 标"疑似历史遗留，人工确认"，不擅自修。
- 权威源是全局规范 + 项目实例：校验标准变了先改规范，再改本 SKILL（SSOT）。

## 收尾模式（remember 调用）的精简输出

收尾模式下，remember 传入本次文档清单，本 SKILL 只输出：

```markdown
### 📁 文档落位校验（本次 N 个文档）
- ✓ 命名 / ✓ 位置 / ✓ 引用 / ✓ frontmatter — 全通过
（或）
- ⊘ 本项目无 docs 目录，跳过
（或）
- ✗ [文件X] 裸放顶层，建议移到 <模块>/ —— 修/不修？
```

全通过则一句话带过，不打断 remember 的预演收尾；有违规才展开问；无文档目录一句"跳过"。

---

*全局化：2026-06-13 由智数协同项目级 tidy-docs 升级（5 处硬编码 → 自适应探测）。源 SKILL 建于 2026-06-12。*
