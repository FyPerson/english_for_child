"""Calendar gates and atomic parent resets, standalone and embedded."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for week in range(1,5):
        page=browser.new_page()
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto((ROOT/f'build/week{week:02}.html').as_uri())
        page.evaluate("setCourseDate(localDateString(),true);renderHome()")
        assert page.locator('[data-goto="wall"]').is_enabled()
        assert page.locator('.daycard[data-goto="2"]').is_disabled()
        page.evaluate("DAYS[0].steps.forEach((s,si)=>s.blocks.filter(b=>b.b==='checks').forEach(b=>b.items.forEach((_,i)=>dayState(1).checks[`1-${si}-${i}`]=true)));save();renderHome()")
        assert page.locator('.daycard[data-goto="2"]').is_disabled(), 'clicking all checks must not unlock tomorrow'
        page.evaluate("setCourseDate(shiftedDate(localDateString(),-1),true);renderHome()")
        assert page.locator('.daycard[data-goto="2"]').is_enabled(), 'yesterday start opens day 2 despite empty checks'
        assert page.locator('.daycard[data-goto="3"]').is_disabled()
        page.evaluate('curDay=5;renderDay(5)')
        assert page.locator('.daycard').count()==7
        page.evaluate("state.days[1]={checks:{'1-4-0':true}};state.games.doors.best=4;save();openParentPanel()")
        before=page.evaluate('JSON.stringify(state.days)')
        page.locator('[aria-label="Day1 开课日期"]').fill('2020-01-01')
        page.locator('[data-parent-act="setdate"]').click()
        assert page.evaluate('JSON.stringify(state.days)')==before
        assert page.locator('.daycard[data-goto="7"]').is_enabled()
        page.evaluate('openParentPanel()')
        page.locator('[data-clear-with-date]').check()
        page.locator('[aria-label="Day1 开课日期"]').fill('2099-01-01')
        page.locator('[data-parent-act="setdate"]').click()
        assert page.evaluate('Object.values(state.days).every(d=>Object.keys(d.checks).length===0)')
        assert page.evaluate('state.games.doors.best')==0
        assert page.locator('.daycard[data-goto="1"]').is_disabled()
        page.evaluate("setCourseDate(shiftedDate(localDateString(),-1));changeSchedule('pause');state.pausedOn=shiftedDate(localDateString(),-2);state.startDate=shiftedDate(localDateString(),-3);save();renderHome()")
        assert page.evaluate('availableDay()')==2
        page.evaluate("changeSchedule('pause');renderHome()")
        assert page.evaluate('availableDay()')==2
        page.evaluate("changeSchedule('advance');renderHome()")
        assert page.evaluate('availableDay()')==3
        assert page.evaluate("parseProgressBackup(JSON.stringify(progressBackup())).openThrough")==3
        page.evaluate("localStorage.setItem('other-week-test','keep');localStorage.setItem('soundblocks-theme','dark');openParentPanel()")
        page.locator('[data-restart-date]').fill('2020-02-03')
        # Failed storage must preserve original state and not silently reset.
        page.evaluate("window.previousJSON=JSON.stringify(state);window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error('quota')};resetWeekAndReload()")
        assert page.evaluate('JSON.stringify(state)===window.previousJSON')
        page.evaluate('Storage.prototype.setItem=window.originalSet;resetWeekAndReload()')
        assert page.evaluate('state.startDate')=='2020-02-03'
        assert page.evaluate('Object.values(state.days).every(d=>Object.keys(d.checks).length===0)')
        assert page.evaluate("localStorage.getItem('other-week-test')")=='keep'
        assert page.evaluate("localStorage.getItem('soundblocks-theme')")=='dark'
        page.reload()
        assert page.evaluate('state.startDate')=='2020-02-03'
        assert not errors,errors
        page.close()
        print(f'PASS W{week}: calendar, completion independence, date edit, clear, pause/resume, advance, backup, reset, storage failure',flush=True)
    page=browser.new_page()
    page.goto((ROOT/'build/course.html').as_uri())
    f=page.frames[1]
    f.wait_for_selector('.daycard')
    f.evaluate("setCourseDate(shiftedDate(localDateString(),-1),true);renderHome()")
    assert f.locator('.daycard[data-goto="2"]').is_enabled()
    assert f.locator('.daycard[data-goto="3"]').is_disabled()
    assert page.locator('[data-week="2"]').is_disabled()
    f.evaluate("DAYS.forEach((d,di)=>d.steps.forEach((s,si)=>s.blocks.filter(b=>b.b==='checks').forEach(b=>b.items.forEach((_,i)=>dayState(di+1).checks[`${di+1}-${si}-${i}`]=true))));save();renderHome()")
    assert page.locator('[data-week="2"]').is_enabled()
    assert f.locator('.daycard[data-goto="3"]').is_disabled()
    f.evaluate("setCourseDate(localDateString(),true);renderHome()")
    assert page.locator('[data-week="2"]').is_disabled()
    print('PASS combined: calendar days and independent cross-week completion gate',flush=True)
    context=browser.new_context(timezone_id='America/New_York')
    page=context.new_page()
    page.clock.install(time=__import__('datetime').datetime(2026,3,8,4,59,50,tzinfo=__import__('datetime').timezone.utc))
    page.goto((ROOT/'build/week01.html').as_uri())
    page.evaluate("setCourseDate('2026-03-07',true);renderHome()")
    assert page.locator('.daycard[data-goto="2"]').is_disabled()
    page.clock.fast_forward(40000)
    assert page.locator('.daycard[data-goto="2"]').is_enabled()
    page.clock.set_system_time(__import__('datetime').datetime(2026,3,9,4,0,1,tzinfo=__import__('datetime').timezone.utc))
    page.evaluate('refreshDateLocks()')
    assert page.evaluate('availableDay()')==3
    print('PASS local midnight and daylight-saving calendar boundary',flush=True)
    context.close()
    browser.close()
