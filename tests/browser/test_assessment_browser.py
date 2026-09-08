"""W4 assessment isolation, explicit reveal, score persistence and baseline boundaries."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]


def run():
    with sync_playwright() as p:
        browser=p.chromium.launch()
        page=browser.new_page()
        # Calendar is fully open for unrelated game/layout regression scenarios.
        page.add_init_script("document.addEventListener('DOMContentLoaded',()=>{if(typeof state!=='undefined'&&!state.startDate){state.startDate='2020-01-01';save();renderHome();}})")
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto((ROOT/'build'/'week04.html').as_uri())
        pool=page.evaluate('[...RESERVED,...RESERVED_RETEST]')
        for n in range(1,8):
            page.locator(f'.dots [data-goto="{n}"]').click()
            for step in page.locator('.step').all():
                if not step.locator('.step__body').is_visible():step.locator('.step__hd').click()
            words=page.locator('#app').inner_text().lower().split()
            assert not set(pool)&set(words),(n,'assessment leak')
        assert page.evaluate("Guard.isReserved('DAB!')") is True
        assert page.evaluate("WordAudio.play('DAB!')")['status']=='blocked'
        assert page.locator('[data-assessment=retest] .wcard').count()==0
        page.locator('[data-assessment-reveal=exam]').click()
        assert page.locator('[data-assessment=exam] .wcard').count()==5
        assert page.locator('[data-assessment=exam] [data-say]').count()==0
        page.locator('[data-assessment=exam] select').select_option('4')
        page.locator('[data-assessment-reveal=retest]').click()
        page.locator('[data-assessment=retest] select').select_option('3')
        assert '7 / 10' in page.locator('[data-baseline-summary]').inner_text()
        page.locator('[data-assessment=retest] select').select_option('4')
        assert '8 / 10' in page.locator('[data-baseline-summary]').inner_text()
        assert '达到进入第五周' in page.locator('[data-baseline-summary]').inner_text()
        page.locator('[data-assessment-reveal=text]').click()
        assert page.locator('.assessment-text').count()==1
        page.locator('[data-assessment-errors]').fill('3')
        page.locator('[data-assessment-errors]').blur()
        assert '可考虑升级' in page.locator('[data-assessment-result]').inner_text()
        page.locator('[data-assessment-prompted]').check()
        assert '留在本级' in page.locator('[data-assessment-result]').inner_text()
        page.locator('[data-assessment-errors]').fill('7')
        page.locator('[data-assessment-errors]').blur()
        assert '降一级' in page.locator('[data-assessment-result]').inner_text()
        before=page.evaluate('state.assessments')
        page.reload()
        assert page.evaluate('state.assessments')==before
        assert page.locator('.assessment-text').count()==0 # home never reveals a previously viewed passage
        page.locator('.dots [data-goto="7"]').click()
        assert page.locator('[data-assessment=exam] select').input_value()=='4'
        # Backup carries monthly errors and both baseline scores.
        assert page.evaluate('parseProgressBackup(JSON.stringify(progressBackup())).assessments')==before
        assert not errors,errors
        browser.close()
        print('PASS W4: hidden pools, audio guard, 7/10 vs 8/10, reading thresholds, prompts, reload and backup')


if __name__=='__main__':run()
