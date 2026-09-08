"""Real embedded lessons: sequential gates, persistence, cross-week boundaries and mobile."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]

def run():
    with sync_playwright() as p:
        browser=p.chromium.launch()
        page=browser.new_page(viewport={'width':1280,'height':900},has_touch=True)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto((ROOT/'build'/'course.html').as_uri())
        def child():
            page.locator('iframe').content_frame.locator('.daycard').first.wait_for()
            return page.frames[1]
        f=child()
        assert f.locator('.daycard[data-goto="1"]').is_enabled()
        assert f.locator('.daycard[data-goto="2"]').is_disabled()
        # Even a direct render path cannot expose locked daily material.
        f.evaluate('curDay=4;renderDay(4)')
        assert f.locator('.daycard').count()==7
        assert page.locator('[data-week="2"]').is_disabled()
        assert page.locator('[data-week="3"]').is_disabled()
        page.evaluate('openWeek(2);openWeek(0);openWeek(4)')
        assert f.evaluate('META.week')==1
        f.locator('.daycard[data-goto="1"]').click()
        # Expand the check step and complete the actual DOM controls.
        for step in f.locator('.step').all():
            if step.locator('[data-check]').count() and not step.locator('[data-check]').first.is_visible():step.locator('.step__hd').click()
        checks=f.locator('[data-check]')
        for i in range(checks.count()-1):checks.nth(i).click()
        assert not f.evaluate('dayAvailable(2)')
        f.evaluate("()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error('quota')}}")
        checks.last.click()
        assert not f.evaluate('dayAvailable(2)')
        assert f.locator('#progressNotice').is_visible()
        f.evaluate('()=>{Storage.prototype.setItem=window.originalSetItem}')
        f.locator('[data-progress-retry]').click()
        assert not f.evaluate('dayAvailable(2)')
        f.evaluate("setCourseDate(shiftedDate(localDateString(),-1));refreshDateLocks()")
        # Cancellation locks the next day again, and completing restores it.
        checks.last.click()
        assert f.evaluate('dayAvailable(2)')
        checks.last.click()
        page.reload();f=child()
        assert f.locator('.daycard[data-goto="2"]').is_enabled()
        assert f.locator('.daycard[data-goto="3"]').is_disabled()
        # Seed legitimate expected keys to exercise the two cross-week boundaries.
        page.evaluate('''()=>{for(const w of course.weeks.slice(0,1)){
          const days={};w.checks.forEach((keys,i)=>days[i+1]={checks:Object.fromEntries(keys.map(k=>[k,true]))});
          localStorage.setItem(w.key,JSON.stringify({days}));}CourseGate.refresh();}''')
        assert page.locator('[data-week="2"]').is_enabled()
        assert page.locator('[data-week="3"]').is_disabled()
        page.locator('[data-week="2"]').click();f=child()
        assert f.evaluate('META.week')==2
        f.evaluate('''()=>{DAYS.forEach((day,di)=>day.steps.forEach((s,si)=>s.blocks.filter(b=>b.b==='checks').forEach(b=>b.items.forEach((_,i)=>dayState(di+1).checks[`${di+1}-${si}-${i}`]=true))));save();}''')
        assert page.locator('[data-week="3"]').is_enabled()
        page.locator('[data-week="3"]').click();f=child()
        assert f.evaluate('META.week')==3
        assert f.locator('.daycard[data-goto="1"]').is_enabled()
        assert f.locator('.daycard[data-goto="2"]').is_disabled()
        # Strict booleans: stale/malformed data cannot unlock courses.
        page.evaluate('''()=>{const w=course.weeks[0],d=JSON.parse(localStorage.getItem(w.key));
          d.days[7].checks[w.checks[6][0]]="true";localStorage.setItem(w.key,JSON.stringify(d));CourseGate.refresh();}''')
        assert f.locator('.daycard[data-goto="1"]').is_disabled()
        assert page.locator('iframe').is_hidden()
        assert page.locator('#weekBlocked').is_visible()
        assert page.locator('[data-week="2"]').is_disabled()
        assert page.locator('[data-week="3"]').is_disabled()
        page.locator('[data-week="1"]').click();f=child()
        for width in [320,390,768,1280]:
            page.set_viewport_size({'width':width,'height':900})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            assert f.evaluate('document.documentElement.scrollWidth<=innerWidth')
        shots=ROOT/'test-results/screenshots/reliability-mobile'
        shots.mkdir(parents=True,exist_ok=True)
        page.screenshot(path=str(shots/'course-1280.png'))
        page.set_viewport_size({'width':390,'height':844})
        assert not page.locator('#weekNav').is_visible()
        page.locator('#navToggle').tap()
        assert page.locator('#weekNav').is_visible()
        assert page.locator('[data-week="2"]').is_disabled()
        page.screenshot(path=str(shots/'course-390-nav.png'))
        page.locator('[data-week="1"]').tap();f=child()
        assert not page.locator('#weekNav').is_visible()
        page.screenshot(path=str(shots/'course-390.png'))
        assert not errors,errors
        # Website mode reuses the same weekly keys and works without external requests.
        class QuietHandler(SimpleHTTPRequestHandler):
            def log_message(self,*args):pass
        server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT/'build')))
        Thread(target=server.serve_forever,daemon=True).start()
        try:
            web=browser.new_page()
            base=f'http://127.0.0.1:{server.server_port}'
            web.goto(base+'/week01.html')
            web.evaluate('''()=>{setCourseDate(shiftedDate(localDateString(),-1));DAYS[0].steps.forEach((s,si)=>s.blocks.filter(b=>b.b==='checks').forEach(b=>b.items.forEach((_,i)=>dayState(1).checks[`1-${si}-${i}`]=true)));save();}''')
            web.goto(base+'/course.html')
            web.locator('iframe').content_frame.locator('.daycard').first.wait_for()
            wf=web.frames[1]
            assert wf.locator('.daycard[data-goto="2"]').is_enabled()
            web.context.set_offline(True)
            assert web.locator('[data-week="2"]').is_disabled()
            web.locator('[data-week="1"]').click()
            web.locator('iframe').content_frame.locator('.daycard').first.wait_for()
            assert web.frames[1].evaluate('META.week')==1
            assert web.frames[1].locator('.daycard[data-goto="2"]').is_enabled()
            web.context.set_offline(False)
        finally:server.shutdown();server.server_close()
        browser.close()
    print('PASS course: sidebar, week and day gates, save failure, relock, reload, cross-week boundaries, mobile navigation and HTTP/offline')

if __name__=='__main__':run()
