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
    ok(("点字母积木听真人示范" in card) if c_has_audio
       else ("点字母积木听真人示范" not in card),
       "音素卡真人示范提示与 c 音频状态不匹配")
    ok(("真人示范音待补" not in card) if c_has_audio
       else ("真人示范音待补" in card),
       "音素卡待补提示与 c 音频状态不匹配")

    pg.locator('.dots [data-goto="5"]').click()
    pg.wait_for_timeout(200)
    for i in range(pg.locator(".step").count()):
        pg.locator(".step__hd").nth(i).click()
        pg.wait_for_timeout(60)
    pg.wait_for_timeout(300)
    ok(pg.locator(".flash").count() >= 2, "第 5 天缺闪卡组件")
    ok(pg.locator("[data-act='timer']").count() >= 1, "第 5 天裸读没有计时按钮")
    ok(pg.locator(".flash img").count() == 0, "闪卡里出现了插图（违反铁律 4）")

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
    # 无图降级不应把单词渲染两遍（图位一次 + 卡片词一次）
    first = pg.locator(".wcard").first.inner_text()
    ok(first.count("cat") == 1, f"词卡把单词渲染了 {first.count('cat')} 遍（无图降级重复）")
    want_art = pg.evaluate(
        "taughtWords().filter(w => !Guard.isReserved(w))"
        ".filter(w => W[w] && hasIll(W[w].art)).length")
    ok(pg.locator(".wcard .wcard__art").count() == want_art,
       f"词卡图位数与素材不匹配：应为 {want_art}，实际 {pg.locator('.wcard .wcard__art').count()}"
       "（有图才给图位，没图直接不渲染容器）")
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
