# -*- coding: utf-8 -*-
"""week03.html 浏览器冒烟：规范 §13 结构层 + 功能层里能自动化的项，外加里程碑 0（积木架分组固定位）。
用法：python tools/week-checks/smoke_w3_browser.py [目标HTML]
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
    new_sounds = list("goulfb")
    live = pg.evaluate("chs => chs.map(ch => ({ch, live: hasPhoneme(ch)}))", new_sounds)
    live_count = sum(1 for x in live if x["live"])
    wall = pg.locator(".tiles-demo .tile")
    ok(wall.count() >= 6, f"点亮墙积木少于 6 块（实际 {wall.count()}）")
    tags = pg.evaluate("[...document.querySelectorAll('.tiles-demo .tile')].slice(0,6).map(e=>e.tagName)")
    ok(tags == ["BUTTON" if x["live"] else "DIV" for x in live],
       f"点亮墙元素类型与音频状态不配对：{tags}（音频：{live}）")
    ok(pg.locator(".tiles-demo button.tile:not([data-sayph]):not([data-say])").count() == 0, "点亮墙存在哑巴按钮")
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
    vis = pg.evaluate("(()=>{const e=document.querySelector('.book__art'); if(!e) return null;"
                      " const r=e.getBoundingClientRect(); return {hidden:e.hidden,h:r.height,imgs:e.querySelectorAll('img').length};})()")
    if ILL["book"] == 0:
        ok(vis and vis["hidden"] is True and vis["h"] == 0, f"缺小书插画时 .book__art 没收起（{vis}）")

    # ---------- ⑥ 里程碑 0：G4 / G5 积木架分组固定位 ----------
    open_day(pg, 7)
    # G4：点"随机来一单"，等播音阶段结束后积木架出现
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

    ok(not errors, "控制台报错：" + "; ".join(errors[:5]))
    br.close()

print(f"通过 {passes} 项，失败 {len(fails)} 项")
for f in fails:
    print("  FAIL:", f)
sys.exit(1 if fails else 0)
