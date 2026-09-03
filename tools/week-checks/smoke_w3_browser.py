# -*- coding: utf-8 -*-
"""week03.html 浏览器冒烟：规范 §13 结构层 + 功能层里能自动化的项，外加里程碑 0（积木架分组固定位）。
用法：python tools/week-checks/smoke_w3_browser.py [目标HTML]

段落：① 首页 ② 逐天 ③ 新声音区 ④ 换头造词 ⑤ 两扇门/裸读/小书 ⑥ 里程碑 0 分组积木架
      ⑦ 铁律 6：结算 + 落盘 + 刷新恢复（G3/G4/G5，从第二周 smoke 移回，codex 首审 M-6）
      ⑧ 六个无录音新音逐一元素类型 + 全站哑巴按钮 ⑨ 词卡墙 37 词 / 0 保留词 / 缺图降级
      ⑩ 缺素材容器不渲染 ⑪ 庆祝层无图 ⑫ 375px 无横向滚动
G1 / G2 / G6 的结算持久化仍是登记在 README 的 todo（需要音频桩），本文件不覆盖。
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[2]
TARGET = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else REPO / "week03.html"
if not TARGET.exists():
    sys.exit(f"找不到目标文件：{TARGET}")
print(f"目标文件：{TARGET}")
URL = TARGET.as_uri()
STORE_KEY = "soundblocks-w3-v1"
NEW_SOUNDS = list("goulfb")            # FIRST_TEACH_DAY 顺序 = 第 1 到 6 天
WALL_WORDS_EXPECTED = 37               # 第三周 words 块去重（let 无图，其余 36 张插画）
fails, passes = [], 0


def ok(cond, msg):
    global passes
    if cond:
        passes += 1
    else:
        fails.append(msg)


def open_day(pg, n):
    pg.locator(f'.dots [data-goto="{n}"]').click()
    pg.wait_for_timeout(200)
    steps = pg.locator(".step")
    for i in range(steps.count()):
        hd = steps.nth(i).locator(".step__hd")
        if hd.count():
            hd.click()
            pg.wait_for_timeout(40)
    pg.wait_for_timeout(250)
    return steps


# 行为积木（G4 / G5 的积木与槽）保持 button；只承担发音的积木无录音时必须换成 div[role=img]。
# 下面这个选择器命中的就是"哑巴按钮"：是 button.tile，却既不能发音也没有任何行为属性。
DUMB_BUTTON = ("button.tile:not([data-sayph]):not([data-say])"
               ":not([data-g4-tile]):not([data-g4-slot]):not([data-g5-tile]):not([data-g5-slot])")


with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.error: {m.text}") if m.type == "error" else None)
    pg.goto(URL)
    pg.wait_for_timeout(600)

    # ---------- ① 首页 ----------
    ok(pg.locator(".daycard").count() == 7, "首页日卡不是 7 张")
    ok("第 3 周" in pg.locator(".hero__eyebrow").inner_text(), "hero 周次不对")
    ok("g o u l f b" in pg.locator(".brand__wk").inner_text(), "顶栏周次标签不对")
    ok(pg.locator(".dots .dot").count() == 7, "顶部进度点不是 7 个")
    body = pg.locator("body").inner_text()
    for bad in ("undefined", "[object", "NaN"):
        ok(bad not in body, f"首页出现 {bad}")
    live = pg.evaluate("chs => chs.map(ch => ({ch, live: hasPhoneme(ch)}))", NEW_SOUNDS)
    wall = pg.locator(".tiles-demo .tile")
    ok(wall.count() >= 6, f"点亮墙积木少于 6 块（实际 {wall.count()}）")
    tags = pg.evaluate("[...document.querySelectorAll('.tiles-demo .tile')].slice(0,6).map(e=>e.tagName)")
    ok(tags == ["BUTTON" if x["live"] else "DIV" for x in live],
       f"点亮墙元素类型与音频状态不配对：{tags}（音频：{live}）")
    ok(pg.locator(".tiles-demo " + DUMB_BUTTON).count() == 0, "点亮墙存在哑巴按钮")
    ILL = pg.evaluate("({word:Object.keys(WORD_ILL).length, ph:Object.keys(PHONEME_ILL).length,"
                      " book:Object.keys(BOOK_IMG).length, cel:!!CELEBRATE_NAT})")
    print(f"当前素材：词卡 {ILL['word']} / 音素 {ILL['ph']} / 小书 {ILL['book']} / 庆祝图 {'有' if ILL['cel'] else '无'}")
    ok(pg.locator(".wall-entry").count() == 1, "缺词卡墙入口")

    # ---------- ② 逐天 ----------
    for n in range(1, 8):
        steps = open_day(pg, n)
        ok(steps.count() >= 5, f"第 {n} 天步骤少于 5 个")
        txt = pg.locator("#app").inner_text()
        for bad in ("undefined", "[object", "NaN"):
            ok(bad not in txt, f"第 {n} 天出现 {bad}")
        broken = pg.evaluate("Array.from(document.querySelectorAll('#app img'))"
                             ".filter(i=>!i.getAttribute('src')||i.getAttribute('src')==='undefined').length")
        ok(broken == 0, f"第 {n} 天有 {broken} 张空 src 的图")
        # 铁律 4：裸读 / 快闪步骤不出图
        ok(pg.locator(".flash img").count() == 0, f"第 {n} 天闪卡里出现了插图")

    # ---------- ③ 新声音区：无录音 → 家长示范提示，不出哑巴按钮 ----------
    open_day(pg, 1)
    lab = pg.locator(".soundlab").first.inner_text()
    g_live = pg.evaluate("hasPhoneme('g')")
    ok(("这个音还没有真人录音" in lab) != g_live, "新声音 /g/ 的录音/降级提示与音频状态不配对")
    ok(pg.locator(".soundlab__listen").count() == (1 if g_live else 0), "听音按钮与 g 音频状态不配对")
    tiles = pg.evaluate("[...document.querySelectorAll('#app .sound__hd .tile')].map(t=>({ch:t.textContent.trim(),tag:t.tagName}))")
    ok(tiles and tiles[0]["ch"] == "g" and (tiles[0]["tag"] == "BUTTON") == g_live,
       f"新声音区 g 积木元素类型与音频不配对：{tiles}")

    # ---------- ④ 换头造词：第 2 天 -ot 六个头；第 4 天 -og / -ug 两族七个头 ----------
    open_day(pg, 2)
    fam = pg.locator('[data-wordforge="family"]')
    ok(fam.count() == 1, f"第 2 天词族块不是 1 个（{fam.count()}）")
    words = fam.locator("[data-wf-word]").evaluate_all("els=>els.map(e=>e.dataset.wfWord)")
    ok(words == ["hot", "pot", "cot", "got", "dot", "not"], f"第 2 天 -ot 词族不对：{words}")
    open_day(pg, 4)
    fam = pg.locator('[data-wordforge="family"]')
    words = fam.locator("[data-wf-word]").evaluate_all("els=>els.map(e=>e.dataset.wfWord)")
    ok(words == ["dog", "log", "hog", "hug", "mug", "rug", "dug"], f"第 4 天词族不对：{words}")
    ok(fam.locator("[data-wf-reset]").count() == 0 and fam.locator("[data-wf-progress]").count() == 0,
       "词族块出现了重置或计数（探索块不结算）")

    # ---------- ⑤ 第 3 天两扇门、第 5 天裸读、第 6 天小书与认读词 ----------
    open_day(pg, 3)
    pairs = pg.locator("[data-g3-pair]").evaluate_all("els=>els.map(e=>e.dataset.g3Pair)")
    ok(pairs == ["hot,hut", "cot,cut", "not,nut"], f"第 3 天两扇门词对没按 G3_PAIRS 渲染（实际 {pairs}）")
    open_day(pg, 5)
    ok(pg.locator("[data-act='timer']").count() >= 1, "第 5 天裸读没有计时按钮")
    open_day(pg, 6)
    ok(pg.locator(".book").count() >= 1, "第 6 天缺小书阅读器")
    t6 = pg.locator("#app").inner_text()
    ok("The Big Dog" in t6 or "The dog is big" in t6, "第 6 天小书标题/首页没出现")
    ok("to" in t6, "第 6 天认读词 to 没出现")
    # 小书六句只能用累计十九音 + 已教认读词，且不得偷带未教的读法（codex 首审 H-2：hugs 的 s 读 /z/）
    # 复审 R-4：正则取纯字母词元（逗号 / 问号 / 引号都挡不住）；只拒"去掉尾 s 后仍是词表里的词"这种屈折形式
    # （hugs → hug、dogs → dog），bus / gas 这类本身以 s 结尾的合法词不误伤；hugs 显式拒绝兜底
    import re as _re
    book_lines = pg.evaluate("BOOK.pages.map(p=>p.line)")
    w_keys = set(pg.evaluate("Object.keys(W)"))
    inflected = sorted({w for ln in book_lines for w in _re.findall(r"[a-z]+", ln.lower())
                        if len(w) >= 3 and w.endswith("s") and (w[:-1] in w_keys or w == "hugs")})
    ok(not inflected, f"小书句子里出现了未教的 -s 屈折形式（s 读 /z/ 未教）：{inflected}；句子：{book_lines}")
    vis = pg.evaluate("(()=>{const e=document.querySelector('.book__art'); if(!e) return null;"
                      " const r=e.getBoundingClientRect(); return {hidden:e.hidden,h:r.height,imgs:e.querySelectorAll('img').length};})()")
    if ILL["book"] == 0:
        ok(vis and vis["hidden"] is True and vis["h"] == 0, f"缺小书插画时 .book__art 没收起（{vis}）")

    # ---------- ⑥ 里程碑 0：G4 / G5 积木架分组固定位 ----------
    open_day(pg, 7)
    g4 = pg.locator("[data-g4]")
    ok(g4.count() == 1, f"第 7 天 G4 挂载不是 1 个（{g4.count()}）")
    # 无头浏览器放不出音频，G4 的播音阶段会停在 audioFailed；用立即结束的音频桩驱动到摆词阶段
    pg.evaluate("()=>{ window.__origPlay = WordAudio.play; WordAudio.play = key => Promise.resolve({status:'ended'}); }")
    rnd = g4.locator("button", has_text="随机")
    if rnd.count():
        rnd.first.click()
        pg.wait_for_timeout(1500)
    g4_groups = g4.locator(".rack__group")
    ok(g4_groups.count() == 2, f"G4 积木架不是元音/辅音两组（{g4_groups.count()}）")
    ok(g4.locator("[data-g4-tile]").count() == 10, f"G4 积木不是 10 块（{g4.locator('[data-g4-tile]').count()}）")
    g4v = g4.locator(".rack__group--v [data-g4-letter]").evaluate_all("els=>els.map(e=>e.dataset.g4Letter).join('')")
    g4c = g4.locator(".rack__group--c [data-g4-letter]").evaluate_all("els=>els.map(e=>e.dataset.g4Letter).join('')")
    ok(g4v == "aou" and g4c == "hmdglfb", f"G4 分组顺序应按教学顺序（元音 aou / 辅音 hmdglfb），实际：元音 {g4v} 辅音 {g4c}")
    # G5：先勾周检第一项解锁
    g5 = pg.locator("[data-g5]")
    ok(g5.count() == 1, f"第 7 天 G5 挂载不是 1 个（{g5.count()}）")
    if g5.locator("[data-g5-tile]").count() == 0:
        exam_step = pg.locator(".step", has_text="周检")
        first_check = exam_step.locator(".checks [data-check], .checks input, .checks label, .checks li").first
        if first_check.count():
            first_check.click()
            pg.wait_for_timeout(300)
    tiles19 = g5.locator("[data-g5-tile]")
    ok(tiles19.count() == 19, f"G5 积木不是 19 块（{tiles19.count()}）——若为 0，周检解锁没生效")
    if tiles19.count() == 19:
        ok(g5.locator(".rack__group").count() == 2, "G5 积木架不是元音/辅音两组")
        g5v = g5.locator(".rack__group--v [data-g5-letter]").evaluate_all("els=>els.map(e=>e.dataset.g5Letter).join('')")
        g5c = g5.locator(".rack__group--c [data-g5-letter]").evaluate_all("els=>els.map(e=>e.dataset.g5Letter).join('')")
        ok(g5v == "aieou", f"G5 元音组顺序应为 aieou（教学顺序），实际 {g5v}")
        ok(g5c == "stpnckhrmdglfb", f"G5 辅音组顺序应为教学顺序 stpnckhrmdglfb，实际 {g5c}")
        # 辅音组最多 7 块一行：第 8 块的 y 坐标必须低于第 1 块
        ys = g5.locator(".rack__group--c [data-g5-tile]").evaluate_all("els=>els.map(e=>e.getBoundingClientRect().top)")
        ok(len(ys) == 14 and ys[7] > ys[0] + 10, "G5 辅音组没有在第 7 块后换行")
        vowel_bg = g5.locator(".rack__group--v .tile").first.evaluate("e=>getComputedStyle(e).color")
        cons_bg = g5.locator(".rack__group--c .tile").first.evaluate("e=>getComputedStyle(e).color")
        ok(vowel_bg != cons_bg, "元音积木与辅音积木颜色相同（语义色丢了）")
        # 拼 dog：点 d、o、g 入槽
        for ch in "dog":
            g5.locator(f'[data-g5-letter="{ch}"]:not([disabled])').first.click()
            pg.wait_for_timeout(120)
        slots = g5.locator("[data-g5-slot]").evaluate_all("els=>els.map(e=>e.textContent.trim()).join('')")
        ok(slots == "dog", f"G5 三槽没有拼出 dog（实际 '{slots}'）")
        ok("读读看" in g5.inner_text(), "拼出 dog 后没有出现中性提示「读读看」")
        used = g5.locator("[data-g5-tile][disabled]").count()
        ok(used == 3, f"入槽后应有 3 块积木置灰，实际 {used}")

    # ---------- ⑦ 铁律 6：结算 + 落盘 + 刷新恢复（G3 / G4 / G5）----------
    # 从第二周 smoke 的 ⑦ 段移回（第三周首版漏掉了这一段，断言从 112 掉到 42——codex 首审 M-6）。
    # 沿用第二周 R-3 的写法：全程等状态、不等固定毫秒；刷新后逐项断言，不看 confirms 非空。
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

    def open_all_steps(day):
        pg.locator(f'.dots [data-goto="{day}"]').click(); pg.wait_for_timeout(400)
        for i in range(pg.locator(".step").count()):
            pg.locator(".step__hd").nth(i).click(); pg.wait_for_timeout(80)

    # 从干净状态开始：⑥ 段勾过周检打卡（toggle），清空 localStorage 消除顺序依赖
    pg.goto(URL); pg.wait_for_timeout(300)
    pg.evaluate("localStorage.clear()")
    pg.goto(URL); pg.wait_for_timeout(500)
    # 导航后页内的音频桩已失效；第三周 G3 的六个词已有录音（WORD_AUDIO 含 hot/hut/cot/cut/not/nut），但无头浏览器不出声、不会
    # 触发 ended，门永远不启用——重新打桩让播放立即结束（G3 / G4 都走 WordAudio.play）
    pg.evaluate("()=>{ WordAudio.play = key => Promise.resolve({status:'ended'}); }")
    # G3 两扇门（第三周在第 3 天）：10 题走完 → doors.best 落盘
    open_all_steps(3); pg.wait_for_timeout(1500)
    ok(pg.locator('[data-g3-act="start"]').count() == 3, "第 3 天不是三组最小对立词")
    pg.locator('[data-g3-act="start"]').first.click()
    try:
        pg.wait_for_selector("[data-g3-door]:not([disabled])", timeout=10000)
    except Exception:
        pass
    ok(pg.locator("[data-g3-door]").count() > 0, "点开始后没有渲染出两扇门")
    answered = 0
    for _ in range(14):
        try:
            pg.wait_for_selector("[data-g3-door]:not([disabled])", timeout=6000)
        except Exception:
            break
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

    # G4 点单：选单 → 摆词 → 撤回一块 → 补回 → 长按确认 → confirms 落盘（codex M-6：分组后要走完整交互）
    open_all_steps(7); pg.wait_for_timeout(800)
    pg.locator('[data-check="7-5-0"]').click(); pg.wait_for_timeout(700)   # 周检第一项：解锁 G5
    pg.evaluate("()=>{ WordAudio.play = key => Promise.resolve({status:'ended'}); }")
    order = pg.locator("[data-g4-order]").first
    word = order.get_attribute("data-g4-order") or ""
    order.click()
    try:
        pg.wait_for_selector("[data-g4-tile]", timeout=10000)
    except Exception:
        pass
    # 摆到倒数第二块就停：摆满会立刻自动判对进入确认态，那时槽不再响应撤回（retractSlot 只在摆词态生效）
    head = word[:-1]
    for ch in head:
        pg.locator(f'[data-g4-letter="{ch}"]:not([disabled])').first.click(); pg.wait_for_timeout(200)
    g4slots = pg.locator("[data-g4-slot]").evaluate_all("els=>els.map(e=>e.textContent.trim()).join('')")
    ok(g4slots == head, f"G4 分组积木架摆 {head} 后槽里是 '{g4slots}'")
    ok(pg.locator("[data-g4-tile][disabled]").count() == len(head), f"G4 摆 {len(head)} 块后置灰积木数应为 {len(head)}")
    # 撤回刚摆的那块：点槽 → 槽空、积木恢复可点（分组渲染后 tile 索引仍是 RACK_LETTERS 索引，撤回要能对上）
    pg.locator("[data-g4-slot]").nth(len(head) - 1).click(); pg.wait_for_timeout(250)
    g4slots = pg.locator("[data-g4-slot]").evaluate_all("els=>els.map(e=>e.textContent.trim()).join('')")
    ok(g4slots == head[:-1], f"G4 点槽撤回后应剩 '{head[:-1]}'，实际 '{g4slots}'")
    ok(pg.locator(f'[data-g4-letter="{head[-1]}"]:not([disabled])').count() == 1, "G4 撤回后积木没有恢复可点")
    ok(pg.locator("[data-g4-tile][disabled]").count() == len(head) - 1, "G4 撤回后置灰积木数没有减一")
    # 补回并摆满 → 自动判对 → 出确认按钮
    for ch in (head[-1], word[-1]):
        pg.locator(f'[data-g4-letter="{ch}"]:not([disabled])').first.click(); pg.wait_for_timeout(300)
    try:
        pg.wait_for_selector(".g4__confirm", timeout=5000)
    except Exception:
        pass
    ok(pg.locator(".g4__confirm").count() == 1, f"G4 摆对 {word} 后没有出现确认按钮")
    if pg.locator(".g4__confirm").count() == 1:
        long_press(".g4__confirm")
        ok((games_state().get("confirms") or {}).get(word), f"G4 长按确认后 confirms.{word} 未落盘")

    # G5 造词：摆 cat → 清空 → 再摆 → 长按确认 → confirms 落盘
    for ch in "cat":
        pg.locator(f'[data-g5-letter="{ch}"]:not([disabled])').first.click(); pg.wait_for_timeout(200)
    ok(pg.locator("[data-g5-tile][disabled]").count() == 3, "G5 摆 cat 后应有 3 块置灰")
    clear_btn = pg.locator('[data-g5-act="clear"]')
    ok(clear_btn.count() >= 1, "G5 没有「清空重来」按钮")
    if clear_btn.count():
        clear_btn.first.click(); pg.wait_for_timeout(250)
        g5slots = pg.locator("[data-g5-slot]").evaluate_all("els=>els.map(e=>e.textContent.trim()).join('')")
        ok(g5slots == "" and pg.locator("[data-g5-tile][disabled]").count() == 0,
           f"G5 清空后槽应全空、积木全部可点（槽 '{g5slots}'，置灰 {pg.locator('[data-g5-tile][disabled]').count()}）")
    for ch in "cat":
        pg.locator(f'[data-g5-letter="{ch}"]:not([disabled])').first.click(); pg.wait_for_timeout(200)
    try:
        pg.wait_for_selector(".g5__confirm", timeout=5000)
    except Exception:
        pass
    ok(pg.locator(".g5__confirm").count() == 1, "G5 摆出真词 cat 后没有出现确认按钮")
    if pg.locator(".g5__confirm").count() == 1:
        long_press(".g5__confirm")
        ok((games_state().get("confirms") or {}).get("cat"), "G5 长按确认后 confirms.cat 未落盘")

    pg.reload(); pg.wait_for_timeout(600)
    cf = games_state().get("confirms") or {}
    ok(bool(cf.get(word)), f"刷新后 G4 的 confirms.{word} 丢失（实际 confirms 键={sorted(cf)}）")
    ok(bool(cf.get("cat")), f"刷新后 G5 的 confirms.cat 丢失（实际 confirms 键={sorted(cf)}）")

    # ---------- ⑧ 六个新音逐一：教学日的音素卡积木元素类型 + 全站哑巴按钮 ----------
    for i, ch in enumerate(NEW_SOUNDS, start=1):
        open_day(pg, i)
        live_ch = pg.evaluate("ch => hasPhoneme(ch)", ch)
        # tileHTML：有录音 = 带 data-sayph 的 BUTTON；无录音 = 纯 DIV（字母本身就是可读文本，不另加 role），
        # 且不得带任何交互语义（复审 R-2：期望标签按录音状态显式算，SPAN / P 之类也要红）
        hd = pg.evaluate("[...document.querySelectorAll('#app .sound__hd .tile')].map(t=>({ch:t.textContent.trim(),tag:t.tagName,"
                         "sayph:t.hasAttribute('data-sayph'),tabindex:t.hasAttribute('tabindex'),role:t.getAttribute('role')}))")
        mine = [t for t in hd if t["ch"] == ch]
        want_tag = "BUTTON" if live_ch else "DIV"
        ok(mine and all(t["tag"] == want_tag and t["sayph"] == live_ch for t in mine),
           f"第 {i} 天新音 {ch} 的音素卡积木应为 {want_tag}{'（带 data-sayph）' if live_ch else '（无 data-sayph）'}，实际 {mine}")
        if not live_ch:
            ok(all(not t["tabindex"] and t["role"] != "button" for t in mine),
               f"第 {i} 天无录音的 {ch} 积木带了交互语义（tabindex / role=button）：{mine}")
        ok(pg.locator("#app " + DUMB_BUTTON).count() == 0,
           f"第 {i} 天存在哑巴按钮（button.tile 无发音也无行为属性）")
    open_day(pg, 7)
    ok(pg.locator("#app " + DUMB_BUTTON).count() == 0, "第 7 天存在哑巴按钮")

    # ---------- ⑨ 词卡墙：37 词、0 保留词、缺图卡片降级 ----------
    pg.goto(URL); pg.wait_for_timeout(500)
    pg.locator(".wall-entry").first.click(); pg.wait_for_timeout(500)
    cards = pg.locator(".wcard--wall")
    ok(cards.count() == WALL_WORDS_EXPECTED, f"词卡墙应为 {WALL_WORDS_EXPECTED} 张，实际 {cards.count()}")
    wall_words = cards.evaluate_all("els=>els.map(e=>e.dataset.say)")
    reserved = pg.evaluate("RESERVED")
    ok(not (set(wall_words) & set(reserved)), f"保留词泄漏到词卡墙：{sorted(set(wall_words) & set(reserved))}")
    ok(len(set(wall_words)) == len(wall_words), "词卡墙有重复词")
    empty_art = pg.evaluate("[...document.querySelectorAll('.wcard--wall .wcard__art')]"
                            ".filter(e=>e.querySelector('img') && !e.querySelector('img').getAttribute('src')).length")
    ok(empty_art == 0, f"词卡墙有 {empty_art} 张卡渲染了空 src 的图")
    if ILL["word"] == 0:
        ok(pg.locator(".wcard--wall img").count() == 0, "词卡插画全空时词卡墙仍渲染了 img")

    # ---------- ⑩ 缺素材容器：G1 图标位缺图时整块不渲染 ----------
    open_day(pg, 7)
    if ILL["ph"] == 0:
        ok(pg.locator(".g1card__ico").count() == 0, f"音素插画全空时仍渲染了 {pg.locator('.g1card__ico').count()} 个 .g1card__ico")

    # ---------- ⑪ 庆祝层：无庆祝图时只放彩带，不出空 img ----------
    pg.goto(URL); pg.wait_for_timeout(400)
    pg.evaluate("localStorage.clear()")
    open_day(pg, 1)
    # 找第一个带打卡项的非周检步骤，全部勾上 → 触发 celebrateNat()
    fired = False
    for i in range(pg.locator(".step").count()):
        step = pg.locator(".step").nth(i)
        if "周检" in step.inner_text():
            continue
        checks = step.locator("[data-check]")
        if checks.count() == 0:
            continue
        for j in range(checks.count()):
            checks.nth(j).click(); pg.wait_for_timeout(120)
        pg.wait_for_timeout(500)
        fired = pg.locator(".celebrate-overlay").count() >= 1
        break
    ok(fired, "勾完一个步骤的全部打卡项后没有出现庆祝层")
    if fired:
        ok(pg.locator(".celebrate-overlay .celebrate-nat").count() == (1 if ILL["cel"] else 0),
           "庆祝层里的主角图数量与 CELEBRATE_NAT 状态不配对")
        ok(pg.locator(".celebrate-overlay img:not([src]), .celebrate-overlay img[src='']").count() == 0,
           "庆祝层渲染了空 src 的 img")

    # ---------- ⑫ 375px 窄屏：首页与七天都不出横向滚动（规范 §13 第 14 条）----------
    # 复审 R-5：scrollWidth 与 clientWidth 严格比较，1px 溢出也红；积木架另断言左右边界都在视口内
    # （overflow-x:hidden 遮掉的内容 scrollWidth 看不出来，边界断言能看出来）
    NO_HSCROLL = "document.documentElement.scrollWidth <= document.documentElement.clientWidth"
    pg.set_viewport_size({"width": 375, "height": 740})
    pg.goto(URL); pg.wait_for_timeout(500)
    ok(pg.evaluate(NO_HSCROLL), "375px 首页出现横向滚动")
    for n in range(1, 8):
        open_day(pg, n)
        ok(pg.evaluate(NO_HSCROLL), f"375px 第 {n} 天出现横向滚动（scrollWidth={pg.evaluate('document.documentElement.scrollWidth')}）")
    open_day(pg, 7)
    g5n = pg.locator("[data-g5]")
    if g5n.locator("[data-g5-tile]").count() == 0:
        pg.locator('[data-check="7-5-0"]').click(); pg.wait_for_timeout(500)
    if g5n.locator("[data-g5-tile]").count() == 19:
        boxes = g5n.locator(".rack__group").evaluate_all("els=>els.map(e=>{const r=e.getBoundingClientRect();return [r.left,r.right]})")
        ok(len(boxes) == 2 and all(l >= 0 and r <= 375 for l, r in boxes), f"375px 下 G5 积木架两组的左右边界超出视口：{boxes}")
        tiles_in = g5n.locator("[data-g5-tile]").evaluate_all("els=>els.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=375})")
        ok(tiles_in, "375px 下有 G5 积木超出视口")
        ok(pg.evaluate(NO_HSCROLL), "375px 第 7 天解锁 G5 后出现横向滚动")

    # ---------- ⑬ 家长设置：长按开门、单击无反应、改开课日期、本周从头再来 ----------
    # 2026-09-02 用户拍板：重置包含清进度；入口与重置都长按 1.5 秒（复用 bindLongPress）
    def hold(sel, ms):
        el = pg.locator(sel).first
        el.scroll_into_view_if_needed()      # 页脚在首屏之外；mouse 事件只落在视口内，先滚到可见
        box = el.bounding_box()
        pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        pg.mouse.down(); pg.wait_for_timeout(ms); pg.mouse.up(); pg.wait_for_timeout(400)

    pg.set_viewport_size({"width": 1280, "height": 900})
    pg.goto(URL); pg.wait_for_timeout(400)
    pg.evaluate("localStorage.clear()")
    pg.goto(URL); pg.wait_for_timeout(500)
    ok(pg.locator('[data-startdate-act="clear"]').count() == 0, "页脚仍有一键「清除」开课日期的按钮")
    gate = pg.locator("[data-parent-gate]")
    ok(gate.count() == 1, "页脚缺家长设置入口")
    panel = pg.locator("[data-parent-panel]")
    gate.click(); pg.wait_for_timeout(400)
    ok(panel.evaluate("e=>e.hidden") is True and panel.inner_html().strip() == "", "单击家长设置入口就打开了面板（应需长按 1.5 秒）")
    hold("[data-parent-gate]", 800)
    ok(panel.evaluate("e=>e.hidden") is True, "按住 0.8 秒就打开了面板（应需 1.5 秒）")
    hold("[data-parent-gate]", 1800)
    ok(panel.evaluate("e=>e.hidden") is False and panel.locator('input[type="date"]').count() == 1
       and panel.locator("[data-parent-reset]").count() == 1, "长按 1.8 秒后面板没打开或缺日期框 / 重置按钮")
    # 改开课日期：单击确认即可
    panel.locator('input[type="date"]').fill("2026-09-14")
    panel.locator('[data-parent-act="setdate"]').click(); pg.wait_for_timeout(400)
    saved = pg.evaluate("(()=>{try{return JSON.parse(localStorage.getItem('%s')).startDate}catch(e){return null}})()" % STORE_KEY)
    ok(saved == "2026-09-14", f"面板里设置开课日期后 localStorage 没存对（{saved}）")
    ok("9月14日" in pg.locator("footer").inner_text(), "页脚没有显示新设的开课日期")
    ok(pg.locator("[data-parent-panel]").evaluate("e=>e.hidden") is True, "设置日期后面板没有收起")
    # 制造一点进度，再长按重置：本周的 localStorage 键应被删掉、页面刷新回到全新状态
    open_day(pg, 1)
    first_check = pg.locator("[data-check]").first
    first_check.click(); pg.wait_for_timeout(300)
    ok(pg.evaluate("localStorage.getItem('%s') !== null" % STORE_KEY), "勾打卡后 localStorage 里没有本周状态")
    pg.goto(URL); pg.wait_for_timeout(500)
    hold("[data-parent-gate]", 1800)
    ok(pg.locator("[data-parent-reset]").count() == 1, "重置前面板没打开")
    ok("打卡" in pg.locator("[data-parent-panel]").inner_text(), "面板没有写清会清掉什么")
    pg.locator("[data-parent-reset]").first.click(); pg.wait_for_timeout(400)
    ok(pg.evaluate("localStorage.getItem('%s') !== null" % STORE_KEY), "单击「本周从头再来」就清空了进度（应需长按）")
    with pg.expect_navigation(wait_until="load", timeout=10000):   # 审 20 M-3：等真实重载，不靠固定等待
        hold("[data-parent-reset]", 1800)
    pg.wait_for_timeout(500)
    ok(pg.evaluate("localStorage.getItem('%s')" % STORE_KEY) is None, "长按重置后本周 localStorage 键没有被删掉")
    ok(pg.locator('[data-startdate-act="reveal"]').count() >= 1, "重置刷新后首页没有重新出现开课日期提示条")
    # 鼠标 / 键盘 / 触屏三种输入、右键、滑出、删存储失败、主题保留等完整用例在 smoke_parent_panel.py（三周通用）

    ok(not errors, "控制台报错：" + "; ".join(errors[:5]))
    br.close()

print(f"通过 {passes} 项，失败 {len(fails)} 项")
for f in fails:
    print("  FAIL:", f)
sys.exit(1 if fails else 0)
