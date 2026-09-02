# -*- coding: utf-8 -*-
"""家长设置面板冒烟（与周次无关，三周课件都能跑）。
用法：python tools/week-checks/smoke_parent_panel.py [week01.html week02.html ...]（不传参跑三周）

2026-09-02 用户拍板：重置包含清进度；入口与重置都长按 1.5 秒（复用 bindLongPress）。
运行环境是 Windows PC 浏览器：鼠标与键盘是主路径，触屏为兜底——三种输入都测（codex 20 号 H-1 / M-2 / M-3）：
  鼠标：单击不开、按 0.8 秒不开、按 1.8 秒开、右键按 1.8 秒不开
  键盘：Tab 到入口后 Enter 按 1.8 秒开、空格按 0.5 秒不开
  触屏（CDP 触摸事件）：原地按 1.8 秒开、按住后滑出 60px 不开
  重置：单击不清、长按清（键删除 + 刷新 + 提示条回来 + 主题保留）；删存储失败时不刷新并提示
"""
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[2]
targets = [Path(a).resolve() for a in sys.argv[1:]] or [REPO / "week01.html", REPO / "week02.html", REPO / "week03.html"]
total_fail = 0


def run(target: Path) -> int:
    html = target.read_text(encoding="utf-8")
    key = re.search(r"const KEY = '([^']+)';", html).group(1)
    url = target.as_uri()
    fails, passes = [], [0]

    def ok(cond, msg):
        if cond:
            passes[0] += 1
        else:
            fails.append(msg)

    with sync_playwright() as p:
        br = p.chromium.launch()
        ctx = br.new_context(viewport={"width": 1280, "height": 900}, has_touch=True)
        pg = ctx.new_page()
        cdp = ctx.new_cdp_session(pg)
        errors = []
        pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        def center(sel):
            el = pg.locator(sel).first
            el.scroll_into_view_if_needed()      # 页脚在首屏之外；输入事件只落在视口内，先滚到可见
            b = el.bounding_box()
            return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2

        def hold_mouse(sel, ms, button="left"):
            x, y = center(sel)
            pg.mouse.move(x, y)
            pg.mouse.down(button=button); pg.wait_for_timeout(ms); pg.mouse.up(button=button); pg.wait_for_timeout(400)

        def hold_touch(sel, ms, drift=0):
            x, y = center(sel)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
            if drift:
                pg.wait_for_timeout(200)
                cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x + drift, "y": y}]})
            pg.wait_for_timeout(ms)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            pg.wait_for_timeout(400)

        def hold_key(sel, key_name, ms):
            pg.locator(sel).first.focus()
            pg.keyboard.down(key_name); pg.wait_for_timeout(ms); pg.keyboard.up(key_name); pg.wait_for_timeout(400)

        def panel_hidden():
            return pg.locator("[data-parent-panel]").evaluate("e=>e.hidden")

        def panel_open():
            return (not panel_hidden()) and pg.locator("[data-parent-reset]").count() == 1

        def close_panel():
            if pg.locator('[data-parent-act="close"]').count():
                pg.locator('[data-parent-act="close"]').first.click(); pg.wait_for_timeout(200)

        pg.goto(url); pg.wait_for_timeout(400)
        pg.evaluate("localStorage.clear()")
        pg.goto(url); pg.wait_for_timeout(500)
        ok(pg.locator('[data-startdate-act="clear"]').count() == 0, "页脚仍有一键「清除」")
        ok(pg.locator("[data-parent-gate]").count() == 1, "页脚缺家长设置入口")
        ok(pg.locator("[data-parent-gate]").get_attribute("aria-expanded") == "false", "入口缺 aria-expanded=false")

        # ---- 鼠标 ----
        pg.locator("[data-parent-gate]").click(); pg.wait_for_timeout(400)
        ok(panel_hidden(), "鼠标单击就打开了面板")
        hold_mouse("[data-parent-gate]", 800)
        ok(panel_hidden(), "鼠标按住 0.8 秒就打开了面板")
        hold_mouse("[data-parent-gate]", 1800, button="right")
        ok(panel_hidden(), "鼠标右键按住 1.8 秒打开了面板（应只认主键）")
        hold_mouse("[data-parent-gate]", 1800)
        ok(panel_open(), "鼠标按住 1.8 秒后面板没打开")
        ok(pg.locator("[data-parent-gate]").get_attribute("aria-expanded") == "true", "面板打开后 aria-expanded 没变 true")
        close_panel()
        ok(panel_hidden() and pg.locator("[data-parent-gate]").get_attribute("aria-expanded") == "false", "收起后面板没关或 aria-expanded 没变回")
        ok(pg.evaluate("document.activeElement && document.activeElement.hasAttribute('data-parent-gate')"), "收起后焦点没回到入口")

        # ---- 键盘 ----
        hold_key("[data-parent-gate]", " ", 500)
        ok(panel_hidden(), "键盘空格按 0.5 秒就打开了面板")
        hold_key("[data-parent-gate]", "Enter", 1800)
        ok(panel_open(), "键盘 Enter 按住 1.8 秒后面板没打开")
        close_panel()

        # ---- 触屏 ----
        hold_touch("[data-parent-gate]", 1800, drift=60)
        ok(panel_hidden(), "触屏按住后滑出 60px 仍打开了面板（应视为滚动而取消）")
        hold_touch("[data-parent-gate]", 1800)
        ok(panel_open(), "触屏原地按住 1.8 秒后面板没打开")

        # ---- 改开课日期：单击确认即存 ----
        pg.locator('[data-parent-panel] input[type="date"]').fill("2026-09-14")
        pg.locator('[data-parent-act="setdate"]').click(); pg.wait_for_timeout(400)
        saved = pg.evaluate("(()=>{try{return JSON.parse(localStorage.getItem('%s')).startDate}catch(e){return null}})()" % key)
        ok(saved == "2026-09-14", f"设置开课日期没存对（{saved}）")
        ok("9月14日" in pg.locator("footer").inner_text(), "页脚没显示新日期")
        ok(panel_hidden(), "设置日期后面板没有收起")

        # ---- 制造进度 + 写定主题 ----
        pg.locator('.dots [data-goto="1"]').click(); pg.wait_for_timeout(300)
        for i in range(pg.locator(".step__hd").count()):
            pg.locator(".step__hd").nth(i).click(); pg.wait_for_timeout(30)
        pg.locator("[data-check]").first.click(); pg.wait_for_timeout(300)
        pg.evaluate("localStorage.setItem('soundblocks-theme','dark')")
        pg.goto(url); pg.wait_for_timeout(500)
        ok(pg.evaluate("localStorage.getItem('%s') !== null" % key), "勾打卡后没有状态")

        # ---- 重置：删存储失败时不刷新、要提示 ----
        hold_mouse("[data-parent-gate]", 1800)
        ok(panel_open(), "重置前面板没打开")
        ok("无法恢复" in pg.locator("[data-parent-panel]").inner_text(), "面板没写明清除后无法恢复")
        # 临时把 removeItem 换成空操作模拟"浏览器不让删"；用 try/finally 保证原函数放回原型
        # （delete 会连原函数一起删掉；evaluate 要显式 return 0，函数值不能序列化回 Python）
        pg.evaluate("(()=>{ window.__realRemove = Storage.prototype.removeItem; Storage.prototype.removeItem = function(){}; return 0; })()")
        try:
            pg.locator("[data-parent-reset]").first.click(); pg.wait_for_timeout(400)
            ok(pg.evaluate("localStorage.getItem('%s') !== null" % key), "单击重置就清空了（应需长按）")
            hold_mouse("[data-parent-reset]", 1800)
            ok(pg.evaluate("localStorage.getItem('%s') !== null" % key) and "未能清除" in pg.locator("[data-parent-panel]").inner_text(),
               "删存储失败时没有提示，或页面被刷新")
        finally:
            pg.evaluate("(()=>{ Storage.prototype.removeItem = window.__realRemove; delete window.__realRemove; return 0; })()")

        # ---- 重置：正常路径 ----
        with pg.expect_navigation(wait_until="load", timeout=10000):
            hold_mouse("[data-parent-reset]", 1800)
        pg.wait_for_timeout(500)
        ok(pg.evaluate("localStorage.getItem('%s')" % key) is None, "长按重置后本周键没删掉")
        ok(pg.locator('[data-startdate-act="reveal"]').count() >= 1, "重置后首页没重新出现开课日期提示条")
        ok(pg.evaluate("localStorage.getItem('soundblocks-theme')") == "dark", "重置把主题键也清掉了")
        ok(pg.locator("[data-check].on, [data-check][aria-checked='true']").count() == 0, "重置刷新后仍有打卡勾")
        ok(not errors, "控制台报错：" + "; ".join(errors[:3]))
        br.close()

    print(f"{target.name}: 通过 {passes[0]} 项，失败 {len(fails)} 项")
    for f in fails:
        print("  FAIL:", f)
    return len(fails)


for t in targets:
    if not t.exists():
        sys.exit(f"找不到 {t}")
    total_fail += run(t)
sys.exit(1 if total_fail else 0)
