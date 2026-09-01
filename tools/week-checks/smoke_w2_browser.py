# -*- coding: utf-8 -*-
"""week02.html 浏览器冒烟。对应规范 §13 结构层 + 功能层里能自动化的项。"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

# M-4：不要写死绝对路径。从脚本自身位置推仓库根（tools/week-checks/ → 上两级），
# 允许命令行传目标 HTML，并打印最终解析路径——否则换机器时会静默审错文件。
REPO = Path(__file__).resolve().parents[2]
TARGET = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else REPO / "week02.html"
if not TARGET.exists():
    sys.exit(f"找不到目标文件：{TARGET}\n用法：python {Path(__file__).name} [目标HTML]")
print(f"目标文件：{TARGET}")
URL = TARGET.as_uri()
STORE_KEY = "soundblocks-w2-v1"
fails, passes = [], 0


def ok(cond, msg):
    global passes
    if cond:
        passes += 1
    else:
        fails.append(msg)


with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}")
          if m.type in ("error",) else None)
    pg.goto(URL)
    pg.wait_for_timeout(600)

    # ---------- ① 首页 ----------
    ok(pg.locator(".daycard").count() == 7, "首页日卡不是 7 张")
    ok(pg.locator(".tiles-demo .tile").count() == 8, "hero 积木不是 7 块新音 + 1 个示例词")
    ok(pg.locator(".wall-entry").count() == 1, "缺词卡墙入口")
    ok("第 2 周" in pg.locator(".hero__eyebrow").inner_text(), "hero 周次不对")
    ok(pg.locator(".dots .dot").count() == 7, "顶部进度点不是 7 个")
    ok("c k e h r m d" in pg.locator(".brand__wk").inner_text(), "顶栏周次标签不对")
    body = pg.locator("body").inner_text()
    ok("undefined" not in body, "首页出现 undefined")
    ok("[object" not in body, "首页出现 [object Object]")

    # 音素录音可分批补进来。断言必须锁"音频在 → button；音频不在 → div"的配对关系，
    # 不能写死第二周永远缺音，否则素材一到位测试就会因为错误的原因变红。
    new_sounds = ["c", "k", "e", "h", "r", "m", "d"]
    live_new = pg.evaluate(
        "chs => chs.map(ch => ({ch, live: hasPhoneme(ch)}))", new_sounds)
    live_count = sum(1 for item in live_new if item["live"])
    ok(pg.locator(".tiles-demo .tile[data-sayph]").count() == live_count,
       f"点亮墙可听积木数与音频不匹配：应为 {live_count}，"
       f"实际 {pg.locator('.tiles-demo .tile[data-sayph]').count()}")
    tags = pg.evaluate("[...document.querySelectorAll('.tiles-demo .tile')].map(e=>e.tagName)")
    expected_tags = ["BUTTON" if item["live"] else "DIV" for item in live_new] + ["BUTTON"]
    ok(tags == expected_tags,
       f"点亮墙元素类型与音频不匹配：期望 {expected_tags}，实际 {tags}")
    missing_count = len(new_sounds) - live_count
    ok(pg.locator('.tiles-demo div.tile[role="img"]').count() == missing_count,
       f"无录音的新音应有 {missing_count} 个 div[role=img]，"
       f"实际 {pg.locator('.tiles-demo div.tile[role="img"]').count()}")
    ok(pg.locator(".tiles-demo button.tile:not([data-sayph]):not([data-say])").count() == 0,
       "存在既无 data-sayph 也无 data-say、却仍是 button 的积木（哑巴按钮）")

    # 插画是分批补进来的（tools/embed_assets.py）。下面所有"缺图降级"的断言都不能
    # 写死"一张图都没有"，否则图一到位就会因为错误的原因变红。改成断言**配对关系**：
    # 图在 → 必须渲染出来；图不在 → 必须连容器一起收起。
    ILL = pg.evaluate("({word:Object.keys(WORD_ILL), ph:Object.keys(PHONEME_ILL),"
                      " book:Object.keys(BOOK_IMG), cel:!!CELEBRATE_NAT})")
    print(f"当前素材：词卡 {len(ILL['word'])} / 音素 {len(ILL['ph'])} / 小书 {len(ILL['book'])}"
          f" / 庆祝图 {'有' if ILL['cel'] else '无'}")

    # ---------- ② 逐天 ----------
    for n in range(1, 8):
        pg.locator(f'.dots [data-goto="{n}"]').click()
        pg.wait_for_timeout(250)
        steps = pg.locator(".step")
        ok(steps.count() >= 5, f"第 {n} 天步骤少于 5 个")
        # 展开每一步
        for i in range(steps.count()):
            hd = steps.nth(i).locator(".step__hd")
            if hd.count():
                hd.click()
                pg.wait_for_timeout(60)
        pg.wait_for_timeout(300)
        txt = pg.locator("#app").inner_text()
        ok("undefined" not in txt, f"第 {n} 天出现 undefined")
        ok("[object" not in txt, f"第 {n} 天出现 [object Object]")
        ok("NaN" not in txt, f"第 {n} 天出现 NaN")
        # 破图检查
        broken = pg.evaluate(
            "Array.from(document.querySelectorAll('#app img'))"
            ".filter(i=>!i.getAttribute('src')||i.getAttribute('src')==='undefined').length")
        ok(broken == 0, f"第 {n} 天有 {broken} 张空 src 的图")

    # ---------- ③ 关键组件 ----------
    pg.locator('.dots [data-goto="1"]').click()
    pg.wait_for_timeout(200)
    pg.locator(".step__hd").nth(1).click()   # 新声音 /k/
    pg.wait_for_timeout(300)
    lab = pg.locator(".soundlab").inner_text()
    c_has_audio = pg.evaluate("hasPhoneme('c')")
    ok(("这个音还没有真人录音" not in lab) if c_has_audio
       else ("这个音还没有真人录音" in lab),
       "新声音区的录音/降级提示与 c 音频状态不匹配")
    want_listen = 1 if c_has_audio else 0
    ok(pg.locator(".soundlab__listen").count() == want_listen,
       f"新声音区听音按钮与 c 音频状态不匹配：应为 {want_listen}，"
       f"实际 {pg.locator('.soundlab__listen').count()}")
    day1_art = pg.evaluate("SOUNDS['c'].art")
    want_mnemonic = 1 if day1_art in ILL["ph"] else 0
    ok(pg.locator(".mnemonic-img").count() == want_mnemonic,
       f"助记图渲染与素材不匹配：'{day1_art}' "
       f"{'已内嵌，应渲染 1 张' if want_mnemonic else '未内嵌，不该渲染'}，"
       f"实际 {pg.locator('.mnemonic-img').count()} 张")
    card = pg.locator(".sound").first.inner_text()
    # 一音多形（第二周 c/k）：sound__hd 里每个字母积木都要与**自己的**录音状态配对。
    # 这里锁元素类型而不是文案——文案改措辞不该让测试变红，而"有录音却没做成按钮"
    # 或"没录音却渲染成 button"（铁律 8 哑巴按钮）必须被抓住。
    forms = pg.evaluate("""()=>{
        const s='c';
        const all=[s].concat(Object.keys(SOUNDS).filter(k=>k!==s && SOUNDS[k].audioKey===s));
        return all.map(f=>({f:f, has:hasPhoneme(f)}));
    }""")
    tiles = pg.evaluate("""()=>[...document.querySelectorAll('#app .sound__hd .tile')]
        .map(t=>({ch:t.textContent.trim(), tag:t.tagName, sayph:t.getAttribute('data-sayph')}))""")
    ok(len(tiles) == len(forms),
       f"新声音区字母积木数与一音多形不符：应 {len(forms)} 块"
       f"（{[x['f'] for x in forms]}），实际 {len(tiles)} 块")
    for want, got in zip(forms, tiles):
        ok(got["ch"] == want["f"],
           f"字母积木内容/顺序不符：应 '{want['f']}'，实际 '{got['ch']}'")
        if want["has"]:
            ok(got["tag"] == "BUTTON" and got["sayph"] == want["f"],
               f"'{want['f']}' 有录音却不是听音按钮"
               f"（tag={got['tag']} data-sayph={got['sayph']}）")
        else:
            ok(got["tag"] != "BUTTON",
               f"'{want['f']}' 没有录音却渲染成 button（铁律 8 哑巴按钮）")
    hint = pg.locator(".sound__hint").first.inner_text()
    ok(("听" in hint) if c_has_audio else ("待补" in hint),
       f"音素卡提示语与 c 音频状态不匹配：有录音应引导去听、没录音应说明待补，实际「{hint}」")
    ok(("真人示范音待补" not in card) if c_has_audio
       else ("真人示范音待补" in card),
       "音素卡待补提示与 c 音频状态不匹配")

    # G1 轮次过滤：带 only 的块只出那一轮（第一天只教 /k/，不提前暴露第二天的 /e/），
    # 不带 only 的出全部轮次。锁"块声明与实际渲染的配对关系"，不写死轮次键，
    # 换周改 G1_ROUNDS 或改哪天放游戏都不用动这条断言。
    for day_n in (1, 7):
        pg.locator(f'.dots [data-goto="{day_n}"]').click()
        pg.wait_for_timeout(200)
        for i in range(pg.locator(".step__hd").count()):
            pg.locator(".step__hd").nth(i).click()
            pg.wait_for_timeout(50)
        pg.wait_for_timeout(250)
        want = pg.evaluate(
            "(n)=>{const blks=DAYS[n-1].steps.flatMap(s=>s.blocks).filter(b=>b.b==='g1');"
            "return blks.flatMap(b=>b.only?[b.only]:Object.keys(G1_ROUNDS));}", day_n)
        got = pg.eval_on_selector_all(".g1card", "els=>els.map(e=>e.dataset.g1Round)")
        ok(got == want,
           f"第 {day_n} 天 G1 渲染的轮次与块声明不符：应 {want}，实际 {got}")
        # ↑ 上一条只验"渲染跟着声明走"，去掉 only 时两边同步变化、抓不住教学顺序问题。
        # ↓ 这一条才是真不变量：当天出现的轮次，其音必须当天或之前已教过。
        taught = pg.evaluate(
            "(n)=>{const s=new Set(); for(let i=0;i<n;i++) DAYS[i].sounds.forEach(x=>s.add(x));"
            "return [...s];}", day_n)
        early = [r for r in got if r not in taught]
        ok(not early,
           f"第 {day_n} 天 G1 提前暴露了尚未教的音：{early}"
           f"（当天及之前已教：{taught}）")

    # 第 3 天词族游戏：与第 4 天统一为无状态算式行，可反复点击并短暂弹图。
    pg.locator('.dots [data-goto="3"]').click()
    pg.wait_for_timeout(200)
    for i in range(pg.locator(".step").count()):
        pg.locator(".step__hd").nth(i).click()
        pg.wait_for_timeout(50)
    pg.wait_for_timeout(250)
    family = pg.locator('[data-wordforge="family"]')
    ok(family.count() == 1, f"第 3 天词族积木工坊不是 1 个（实际 {family.count()}）")
    family_choices = family.locator("[data-wf-word]")
    ok(family_choices.count() == 7,
       f"第 3 天词族游戏不是 7 个可点组合（实际 {family_choices.count()}）")
    if family_choices.count() == 7:
        ok(family.locator(".wordforge__equation-rows").count() == 2,
           "第 3 天词族游戏不是 at / it 两组纵向算式")
        ok(family_choices.evaluate_all("els=>els.map(e=>e.dataset.wfWord)") ==
           ["cat", "hat", "pat", "sat", "hit", "kit", "sit"],
           "第 3 天词族游戏的 7 个算式单词不正确")
        family_equations = family.locator(".wordforge__equation").evaluate_all(
            "els=>els.slice(0,2).map(e=>e.textContent.replace(/\\s/g,''))")
        ok(family_equations == ["c＋at→cat", "h＋at→hat"],
           f"第 3 天词族游戏没有采用 c + at → cat 式排版（实际 {family_equations}）")
        ok(family.locator("[data-wf-reset]").count() == 0 and
           family.locator("[data-wf-progress]").count() == 0,
           "第 3 天词族游戏仍显示重新开始或已发现计数")
        initial_bg = family_choices.first.evaluate("e=>getComputedStyle(e).backgroundColor")
        pg.evaluate("""()=>{
            window.__wfOriginalPlay = WordAudio.play;
            window.__wfPlayed = [];
            WordAudio.play = key => { window.__wfPlayed.push(key); return Promise.resolve({status:'ended'}); };
        }""")
        family.locator(".wordforge__brick--tail").first.click(); pg.wait_for_timeout(80)
        ok(pg.evaluate("window.__wfPlayed.slice()") == [],
           "第 3 天点击词尾也会播放单词，点击范围没有限制在音素头")
        family_choices.first.click(); pg.wait_for_timeout(80)
        family_choices.first.click(); pg.wait_for_timeout(80)
        ok(pg.evaluate("window.__wfPlayed.slice()") == ["cat", "cat"],
           "第 3 天同一个词不能反复点击发音")
        ok(family_choices.first.evaluate("e=>getComputedStyle(e).backgroundColor") == initial_bg,
           "第 3 天词族游戏点击后仍会保持加深背景")
        family_picture = family.locator('[data-wf-picture]')
        ok(family_picture.count() == 1 and family_picture.get_attribute("data-wf-picture-word") == "cat",
           "第 3 天点击 cat 后没有短暂弹出对应插画")
        ok(family_picture.evaluate("e=>e.parentElement.hasAttribute('data-wf-result')"),
           "第 3 天配图没有显示在练习区最下方的反馈栏")
        for inherited_word in ("pat", "sat", "sit"):
            family.locator(f'[data-wf-word="{inherited_word}"]').click()
            pg.wait_for_timeout(80)
            inherited_picture = family.locator('[data-wf-picture]')
            ok(inherited_picture.count() == 1 and
               inherited_picture.get_attribute("data-wf-picture-word") == inherited_word,
               f"第 3 天点击 {inherited_word} 后没有显示对应插画")
            ok(inherited_picture.locator("img").count() == 1 and
               inherited_picture.locator("svg").count() == 0,
               f"{inherited_word} 没有复用第一周的 PNG 原图，或仍在显示 SVG")
        pg.evaluate("""()=>{
            WordAudio.play = window.__wfOriginalPlay;
            delete window.__wfOriginalPlay;
            delete window.__wfPlayed;
        }""")

    # 第 4 天换头游戏：每组固定词尾，两个头都能单独点击和发音。
    pg.locator('.dots [data-goto="4"]').click()
    pg.wait_for_timeout(200)
    for i in range(pg.locator(".step").count()):
        pg.locator(".step__hd").nth(i).click()
        pg.wait_for_timeout(50)
    pg.wait_for_timeout(250)
    swap = pg.locator('[data-wordforge="swap"]')
    ok(swap.count() == 1, f"第 4 天换头造词机不是 1 个（实际 {swap.count()}）")
    swap_choices = swap.locator("[data-wf-word]")
    ok(swap.locator(".wordforge__swap-family").count() == 3,
       f"第 4 天换头游戏不是 3 组固定词尾（实际 {swap.locator('.wordforge__swap-family').count()}）")
    ok(swap.locator(".wordforge__swap-family").evaluate_all(
       "els=>els.every(e=>parseFloat(getComputedStyle(e).borderWidth)>0)"),
       "第 4 天三组词没有像第 3 天一样分别用边框包裹")
    ok(swap.locator(".wordforge__equation-rows").count() == 3,
       "第 4 天换头游戏没有给每组建立上下两行")
    ok(swap_choices.count() == 6,
       f"第 4 天换头游戏不是 6 个可点的头（实际 {swap_choices.count()}）")
    if swap_choices.count() == 6:
        ok(swap_choices.evaluate_all("els=>els.map(e=>e.dataset.wfWord)") ==
           ["hat", "rat", "hip", "rip", "can", "ran"],
           "第 4 天换头游戏的 3 组双头单词不正确")
        ok(swap.locator(".wordforge__swap-family").first.locator(".wordforge__equation-choice").count() == 2,
           "第 4 天换头游戏首组不是上下两个词")
        ok(swap.locator(".wordforge__equation-rows").first.evaluate("e=>getComputedStyle(e).flexDirection") == "column",
           "第 4 天换头游戏的两个词没有纵向排列")
        first_equations = swap.locator(".wordforge__equation").evaluate_all(
            "els=>els.slice(0,2).map(e=>e.textContent.replace(/\\s/g,''))")
        ok(first_equations == ["h＋at→hat", "r＋at→rat"],
           f"第 4 天换头游戏首组排版不是 h + at → hat / r + at → rat（实际 {first_equations}）")
        first_word_size = float(swap.locator(".wordforge__equation-word").first.evaluate(
            "e=>parseFloat(getComputedStyle(e).fontSize)"))
        ok(first_word_size <= 20,
           f"第 4 天换头结果词仍然过大（实际 {first_word_size}px）")
        ok(swap.locator("[data-wf-reset]").count() == 0 and
           swap.locator("[data-wf-progress]").count() == 0,
           "第 4 天换头游戏仍显示重新开始或已听过计数")
        initial_swap_bg = swap_choices.first.evaluate("e=>getComputedStyle(e).backgroundColor")
        # 用立即结束的音频桩确认：点哪个头，只播放该头组成的一个单词。
        pg.evaluate("""()=>{
            window.__wfOriginalPlay = WordAudio.play;
            window.__wfPlayed = [];
            WordAudio.play = key => { window.__wfPlayed.push(key); return Promise.resolve({status:'ended'}); };
        }""")
        swap.locator(".wordforge__equation-word").first.click(); pg.wait_for_timeout(80)
        ok(pg.evaluate("window.__wfPlayed.slice()") == [],
           "第 4 天点击结果词也会播放单词，点击范围没有限制在音素头")
        swap_choices.first.click(); pg.wait_for_timeout(80)
        ok(pg.evaluate("window.__wfPlayed.slice()") == ["hat"],
           f"点击 h 头没有只播放 hat（实际 {pg.evaluate('window.__wfPlayed.slice()')}）")
        picture = swap.locator('[data-wf-picture]')
        ok(picture.count() == 1 and picture.get_attribute("data-wf-picture-word") == "hat",
           "点击 hat 后没有弹出对应插画")
        ok(picture.locator("img").count() == 1,
           "hat 的短暂反馈没有使用词卡插画")
        ok(picture.evaluate("e=>e.parentElement.hasAttribute('data-wf-result')"),
           "第 4 天配图没有显示在练习区最下方的反馈栏")
        swap_choices.nth(1).click(); pg.wait_for_timeout(80)
        ok(pg.evaluate("window.__wfPlayed.slice()") == ["hat", "rat"],
           f"再点击 r 头没有单独播放 rat（实际 {pg.evaluate('window.__wfPlayed.slice()')}）")
        ok(picture.count() == 1 and picture.get_attribute("data-wf-picture-word") == "rat",
           "连续点击另一个头时，插画没有立即切换为 rat")
        pg.wait_for_timeout(1550)
        ok(picture.count() == 0,
           "换头造词插画弹出后没有自动消失")
        ok("反复比较" in swap.locator("[data-wf-result]").inner_text(),
           "换头造词插画消失后没有恢复底部提示")
        for i in range(2, 6):
            swap_choices.nth(i).click(); pg.wait_for_timeout(50)
        swap_choices.first.click(); pg.wait_for_timeout(80)
        ok(pg.evaluate("window.__wfPlayed.slice(-1)") == ["hat"],
           "第 4 天换头游戏听完一轮后不能继续反复点击")
        ok(swap_choices.first.evaluate("e=>getComputedStyle(e).backgroundColor") == initial_swap_bg,
           "第 4 天换头游戏点击后仍会保持加深背景")
        pg.evaluate("""()=>{
            WordAudio.play = window.__wfOriginalPlay;
            delete window.__wfOriginalPlay;
            delete window.__wfPlayed;
        }""")

    pg.locator('.dots [data-goto="5"]').click()
    pg.wait_for_timeout(200)
    for i in range(pg.locator(".step").count()):
        pg.locator(".step__hd").nth(i).click()
        pg.wait_for_timeout(60)
    pg.wait_for_timeout(300)
    ok(pg.locator(".flash").count() >= 2, "第 5 天缺闪卡组件")
    ok(pg.locator("[data-act='timer']").count() >= 1, "第 5 天裸读没有计时按钮")
    ok(pg.locator(".flash img").count() == 0, "闪卡里出现了插图（违反铁律 4）")
    him_card = pg.locator('.wcard[data-say="him"]')
    ok(him_card.count() == 1, f"第 5 天 him 日课词卡不是 1 张（实际 {him_card.count()}）")
    ok(him_card.locator(".wcard__art").count() == 1,
       "第 5 天 him 没有第一周 it 式文字图位")
    ok(him_card.inner_text().count("him") == 2,
       "第 5 天 him 没有同时显示放大词和卡片正文")

    pg.locator('.dots [data-goto="6"]').click()
    pg.wait_for_timeout(200)
    for i in range(pg.locator(".step").count()):
        pg.locator(".step__hd").nth(i).click()
        pg.wait_for_timeout(60)
    pg.wait_for_timeout(300)
    did_card = pg.locator('.wcard[data-say="did"]')
    ok(did_card.count() == 1, f"第 6 天 did 日课词卡不是 1 张（实际 {did_card.count()}）")
    ok(did_card.locator(".wcard__art").count() == 1,
       "第 6 天 did 没有第一周 it 式文字图位")
    ok(did_card.inner_text().count("did") == 2,
       "第 6 天 did 没有同时显示放大词和卡片正文")

    pg.locator('.dots [data-goto="7"]').click()
    pg.wait_for_timeout(200)
    for i in range(pg.locator(".step").count()):
        pg.locator(".step__hd").nth(i).click()
        pg.wait_for_timeout(80)
    pg.wait_for_timeout(500)
    ok(pg.locator("[data-g1-round]").count() == 2, "第 7 天 G1 不是两轮")
    # R-5：G1 标题图标容器有固定 36px，缺图时必须整块不渲染，不能留空盒子
    want_ico = pg.evaluate(
        "Object.values(G1_THEME).filter(th => hasIll(th.icon)).length")
    ok(pg.locator(".g1card__ico").count() == want_ico,
       f"G1 图标容器数与素材不匹配：应为 {want_ico}，实际 {pg.locator('.g1card__ico').count()}"
       "（缺图时必须整块不渲染，不能留 36px 空盒子）")
    ok(pg.locator("[data-g5]").count() == 1, "第 7 天缺 G5 造词工坊")
    # G4：积木架要先选一张订单才出现（与第一周同款流程）
    ok(pg.locator("[data-g4-order]").count() == 8, "G4 订单不是 8 张")
    pg.locator("[data-g4-order]").first.click()
    pg.wait_for_timeout(2000)   # 选单后有一段"听……"播音阶段，播完才出积木架
    ok(pg.locator("[data-g4-tile]").count() == 10,
       f"G4 积木架不是 10 块（实际 {pg.locator('[data-g4-tile]').count()}）")
    # G5：做完周检才解锁（程序锁，规格 §3.1）
    ok(pg.locator("[data-g5].g5--locked").count() == 1, "G5 一开始应该是锁着的")
    pg.locator('[data-check="7-5-0"]').click()
    pg.wait_for_timeout(700)
    ok(pg.locator("[data-g5].g5--locked").count() == 0, "勾了周检打卡后 G5 仍然锁着")
    ok(pg.locator("[data-g5-tile]").count() == 13,
       f"G5 积木架不是 13 块（实际 {pg.locator('[data-g5-tile]').count()}）")
    exam = pg.locator("#app").inner_text()
    for w in ("ram", "hem", "rid", "dam", "kid"):
        ok(w in exam, f"周检缺词 {w}")

    # ---------- ④ 词卡墙 ----------
    pg.locator(".backlink").first.click()          # 先回首页
    pg.wait_for_timeout(300)
    pg.locator('[data-goto="wall"]').first.click()
    pg.wait_for_timeout(500)
    ok(pg.locator(".wcard").count() == 34, f"词卡墙不是 34 张（实际 {pg.locator('.wcard').count()}）")
    wall = pg.locator("#app").inner_text()
    # 有图词只显示一遍正文；did / him 参考第一周 it，用放大单词占据图位。
    first = pg.locator(".wcard").first.inner_text()
    ok(first.count("cat") == 1, f"有图词卡把单词渲染了 {first.count('cat')} 遍")
    for w in ("did", "him"):
        card = pg.locator(f'.wcard[data-say="{w}"]')
        ok(card.locator(".wcard__art").count() == 1, f"{w} 没有第一周 it 式文字图位")
        ok(card.inner_text().count(w) == 2, f"{w} 没有同时显示放大词和卡片正文")
    want_art = pg.evaluate(
        "taughtWords().filter(w => !Guard.isReserved(w))"
        ".filter(w => W[w] && hasIll(W[w].art)).length")
    ok(pg.locator(".wcard .wcard__art").count() == 34,
       f"词卡图位不是 34 个（实际 {pg.locator('.wcard .wcard__art').count()}）")
    ok(pg.locator(".wcard .wcard__art img").count() == want_art,
       f"词卡图片数与素材不匹配：应为 {want_art}，实际 {pg.locator('.wcard .wcard__art img').count()}")
    # WALL_HINT 为空时不该出现词组提示
    ok("听完单词后会再听词组" not in wall, "WALL_HINT 为空却仍出现词组提示文案")
    for w in ("ram", "hem", "rid", "dam", "kid"):
        ok(f"\n{w}\n" not in wall, f"保留词 {w} 泄漏进词卡墙")

    # ---------- ⑤ 主题 ----------
    pg.locator(".backlink").first.click()
    pg.wait_for_timeout(300)
    light_bg = pg.evaluate("getComputedStyle(document.body).backgroundColor")
    pg.evaluate("document.documentElement.setAttribute('data-theme','dark')")
    pg.wait_for_timeout(150)
    dark_bg = pg.evaluate("getComputedStyle(document.body).backgroundColor")
    ok(light_bg != dark_bg, "深色模式没生效")
    ok("241, 239, 247" in light_bg, f"浅色底不是第二周紫（实际 {light_bg}）")
    ok("24, 22, 29" in dark_bg, f"深色底不是第二周紫（实际 {dark_bg}）")

    # 跟随系统深色
    pg2 = br.new_page(color_scheme="dark")
    pg2.goto(URL)
    pg2.wait_for_timeout(400)
    sys_dark = pg2.evaluate("getComputedStyle(document.body).backgroundColor")
    ok("24, 22, 29" in sys_dark, f"跟随系统深色失效（实际 {sys_dark}）")
    pg2.close()

    # ---------- ⑥ 窄屏 ----------
    pg.set_viewport_size({"width": 375, "height": 780})
    pg.wait_for_timeout(300)
    overflow = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    ok(overflow <= 1, f"375px 下横向溢出 {overflow}px")

    # ---------- ⑦ 铁律 6：结算 + 落盘 + 刷新恢复 ----------
    # 本轮覆盖 G3 / G4 / G5 三个有确定性交互路径的游戏。
    # G1（答题窗 4 秒×8 题）、G2（逐词长按）、G6（计时闪卡）需要给音频打确定性桩
    # 才能稳定驱动，记为 todo，见 README。
    def games_state():
        return pg.evaluate(
            "(()=>{try{return (JSON.parse(localStorage.getItem('%s'))||{}).games||{}}"
            "catch(e){return {}}})()" % STORE_KEY)

    def long_press(sel):
        box = pg.locator(sel).first.bounding_box()
        pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        pg.mouse.down()
        pg.wait_for_timeout(1400)      # bindLongPress 默认 1000ms
        pg.mouse.up()
        pg.wait_for_timeout(500)

    # G3 两扇门：10 题走完 → doors.best 落盘
    # 本段从干净状态开始：前面几段已经勾过第 7 天的周检打卡项（用来验 G5 解锁），
    # 打卡是 toggle，再点一次会取消勾选把 G5 重新锁上——清空 localStorage 消除顺序依赖。
    pg.set_viewport_size({"width": 1280, "height": 900})
    pg.goto(URL); pg.wait_for_timeout(300)
    pg.evaluate("localStorage.clear()")
    pg.goto(URL); pg.wait_for_timeout(500)
    pg.locator('.dots [data-goto="2"]').click(); pg.wait_for_timeout(400)
    for i in range(pg.locator(".step").count()):
        pg.locator(".step__hd").nth(i).click(); pg.wait_for_timeout(80)
    pg.wait_for_timeout(1500)
    ok(pg.locator('[data-g3-act="start"]').count() == 3, "第 2 天不是三组最小对立词")
    pg.locator('[data-g3-act="start"]').first.click()      # 每组要先点「开始这一轮」
    # R-3：全程等状态，不等固定毫秒。两扇门在播音期间是 disabled，播完才启用；
    # 每答一题会再次 disabled（反馈动画）然后下一题重新启用。所以每轮循环都等
    # "出现一个可点的门"——等不到就说明本轮结束了，正常退出。
    try:
        pg.wait_for_selector("[data-g3-door]:not([disabled])", timeout=10000)
    except Exception:
        pass
    ok(pg.locator("[data-g3-door]").count() > 0, "点开始后没有渲染出两扇门")
    answered = 0
    for _ in range(14):                             # 10 题 + 余量
        try:
            pg.wait_for_selector("[data-g3-door]:not([disabled])", timeout=6000)
        except Exception:
            break                                   # 没有可点的门了 = 本轮走完
        try:
            pg.locator("[data-g3-door]:not([disabled])").first.click(timeout=3000)
            answered += 1
        except Exception:
            break
    ok(answered >= 10, f"G3 只答了 {answered} 题，应走满 10 题")
    g = games_state()
    ok(isinstance(g.get("doors", {}).get("best"), int),
       f"G3 走完未把 doors.best 写进 localStorage（实际 games={list(g)}）")
    best_before = g.get("doors", {}).get("best")
    pg.reload(); pg.wait_for_timeout(600)
    ok(games_state().get("doors", {}).get("best") == best_before, "G3 成绩刷新后没保留")

    # G4 点单 + G5 造词：摆对词 → 长按确认 → confirms 落盘
    pg.locator('.dots [data-goto="7"]').click(); pg.wait_for_timeout(400)
    for i in range(pg.locator(".step").count()):
        pg.locator(".step__hd").nth(i).click(); pg.wait_for_timeout(80)
    pg.wait_for_timeout(800)
    pg.locator('[data-check="7-5-0"]').click(); pg.wait_for_timeout(700)   # 解锁 G5

    order = pg.locator("[data-g4-order]").first
    word = order.get_attribute("data-g4-order")
    order.click()
    # R-3：等积木架真的出现（选单后有一段播音），不要死等 2000ms
    try:
        pg.wait_for_selector("[data-g4-tile]", timeout=10000)
    except Exception:
        pass
    for ch in (word or ""):
        pg.locator(f'[data-g4-letter="{ch}"]').first.click(); pg.wait_for_timeout(200)
    try:
        pg.wait_for_selector(".g4__confirm", timeout=5000)
    except Exception:
        pass
    ok(pg.locator(".g4__confirm").count() == 1, f"G4 摆对 {word} 后没有出现确认按钮")
    if pg.locator(".g4__confirm").count() == 1:
        long_press(".g4__confirm")
        ok((games_state().get("confirms") or {}).get(word), f"G4 长按确认后 confirms.{word} 未落盘")

    for ch in "cat":
        pg.locator(f'[data-g5-letter="{ch}"]').first.click(); pg.wait_for_timeout(200)
    try:
        pg.wait_for_selector(".g5__confirm", timeout=5000)
    except Exception:
        pass
    ok(pg.locator(".g5__confirm").count() == 1, "G5 摆出真词 cat 后没有出现确认按钮")
    if pg.locator(".g5__confirm").count() == 1:
        long_press(".g5__confirm")
        ok((games_state().get("confirms") or {}).get("cat"), "G5 长按确认后 confirms.cat 未落盘")

    # R-3：逐项断言，不能只看 confirms 非空——两项里坏一项照样会通过
    pg.reload(); pg.wait_for_timeout(600)
    cf = games_state().get("confirms") or {}
    ok(bool(cf.get(word)), f"刷新后 G4 的 confirms.{word} 丢失（实际 confirms 键={sorted(cf)}）")
    ok(bool(cf.get("cat")), f"刷新后 G5 的 confirms.cat 丢失（实际 confirms 键={sorted(cf)}）")

    # R-5：小书图位有固定 220px 宽高，缺图时必须连容器一起收起（不是只清空内容）
    pg.locator('.dots [data-goto="6"]').click(); pg.wait_for_timeout(400)
    for i in range(pg.locator(".step").count()):
        pg.locator(".step__hd").nth(i).click(); pg.wait_for_timeout(80)
    pg.wait_for_timeout(600)
    ok(pg.locator(".book__art").count() >= 1, "第 6 天没有渲染出小书")
    if pg.locator(".book__art").count():
        page1_art = pg.evaluate("BOOK.pages[0].art")
        has_img = page1_art in ILL["book"]
        vis = pg.evaluate(
            "(()=>{const e=document.querySelector('.book__art');"
            " if(!e) return null; const r=e.getBoundingClientRect();"
            " return {hidden:e.hidden, h:r.height, w:r.width,"
            "  imgs:e.querySelectorAll('img').length};})()")
        if has_img:
            ok(vis and vis["hidden"] is False and vis["imgs"] == 1,
               f"小书第 1 页有插画 '{page1_art}' 却没正常渲染（实际 {vis}）")
            ok(vis and vis["h"] > 0, f"小书图位有图却没有高度（实际 {vis}）")
        else:
            ok(vis and vis["hidden"] is True, f"缺图时 .book__art 没有置 hidden（实际 {vis}）")
            ok(vis and vis["h"] == 0 and vis["w"] == 0,
               f"缺图时 .book__art 仍占 {vis and vis['w']}×{vis and vis['h']} 的空间（220px 空洞）")

    ok(not errors, "控制台报错：" + "; ".join(errors[:5]))
    br.close()

print(f"通过 {passes} 项，失败 {len(fails)} 项")
for f in fails:
    print("  FAIL:", f)
sys.exit(1 if fails else 0)
