# 项目级 SKILL

放在这里的 SKILL 会被 Claude Code **在本仓库内自动加载**，`git clone` / `git pull`
之后不用手动安装就能用。

| SKILL | 用途 | 触发 |
|---|---|---|
| [handoff](./handoff/SKILL.md) | 把项目整理成「换机器 / 换工具 / 换人都能接着干」的状态并推 GitHub | 显式 `/handoff` |
| [tidy-docs](./tidy-docs/SKILL.md) | 校验文档落位（命名 / 位置 / 引用 / frontmatter / _originals 五项） | 显式 `/tidy-docs` |

`tidy-docs` 是被 `handoff` 依赖的——`handoff` 第 4 步会调它做文档落位，
少了它那一步就断了，所以两个一起带。

## ⚠️ 这两份是副本，不是真相源

它们本质是**跨项目**通用的 SKILL，不绑定本项目。放进这个仓库只是为了让
`git pull` 能把它们带到新机器，不代表它们属于这个项目。

| 位置 | 角色 |
|---|---|
| `C:\Users\FY\.claude\skills\<name>\SKILL.md` | **真相源**——Claude Code 全局加载的那份，日常改动改这里 |
| `E:\skill-library\active\<name>_vX.Y_YYYYMMDD.md` | 版本化产出物库，带版本号可追溯 |
| **本目录** | 为跟车 `git pull` 而放的副本 |

**改动请改真相源，然后同步过来**，不要只改这里——只改这里会让三份漂移，
而其他项目加载的是全局那份，改了也不生效。

同步命令（在本仓库根目录跑）：

```powershell
foreach ($k in @('handoff','tidy-docs')) {
  Copy-Item "C:\Users\FY\.claude\skills\$k\SKILL.md" ".claude\skills\$k\SKILL.md" -Force
}
git diff --stat .claude/skills/
```

反向——新机器上想把它们装成**全局**可用（所有项目都能调），而不只是本仓库：

```powershell
foreach ($k in @('handoff','tidy-docs')) {
  New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\skills\$k" | Out-Null
  Copy-Item ".claude\skills\$k\SKILL.md" "$env:USERPROFILE\.claude\skills\$k\SKILL.md"
}
```

装完新开一个会话，Claude 才会重新加载 SKILL 注册。

## 版本对照

两份副本入库时的状态（2026-09-01）：

| SKILL | 行数 | 说明 |
|---|---|---|
| handoff | 308 | v1.0，五条硬规矩全部来自本项目 2026-09-01 那次真实交接踩的坑 |
| tidy-docs | 203 | 2026-06-13 由项目级升为全局，自适应探测项目结构 |

判断本目录的副本有没有落后于真相源：

```bash
for k in handoff tidy-docs; do
  diff -q "$HOME/.claude/skills/$k/SKILL.md" ".claude/skills/$k/SKILL.md" \
    && echo "$k 一致" || echo "$k 已漂移"
done
```
