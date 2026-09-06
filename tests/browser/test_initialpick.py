"""First-week replacement and existing third-week initial-sound game."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]

def run():
    with sync_playwright() as p:
        browser=p.chromium.launch()
        for week,day,total in [(1,7,8),(3,1,5)]:
            page=browser.new_page(viewport={'width':390,'height':844},has_touch=True)
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto((ROOT/f'week{week:02}.html').as_uri())
            page.locator(f'.dots [data-goto="{day}"]').click()
            game=page.locator('[data-initialpick]')
            step=page.locator('.step').filter(has=game)
            if not game.is_visible():step.locator('.step__hd').click()
            page.evaluate('''()=>{window.audioStatus='failed';WordAudio.play=word=>{
                window.lastWord=word;if(audioStatus==='ended')hideAudioFailure();return Promise.resolve({status:audioStatus});};}''')
            game.locator('[data-initial-act=start]').tap()
            game.locator('[data-initial-act=resume]').wait_for()
            assert game.locator('[data-initial-letter]:not([disabled])').count()==0
            page.evaluate("window.audioStatus='ended'")
            game.locator('[data-initial-act=resume]').tap()
            word=page.evaluate('window.lastWord')
            assert game.locator('.initialpick__feedback').count()==0
            wrong=game.locator(f'[data-initial-letter]:not([data-initial-letter="{word[0]}"])').first
            wrong.tap()
            assert game.locator('.initialpick__feedback').count()==0
            game.locator('[data-initial-act=retry]').tap()
            assert page.evaluate('window.lastWord')==word
            if week==1:
                shots=ROOT/'test-results/screenshots/reliability-mobile';shots.mkdir(parents=True,exist_ok=True)
                game.screenshot(path=str(shots/'week01-day07-initialpick.png'))
                assert not page.evaluate('examRecorded()')
            seen=[]
            for _ in range(total):
                word=page.evaluate('window.lastWord');seen.append(word)
                choice=game.locator(f'[data-initial-letter="{word[0]}"]')
                assert choice.bounding_box()['width']>=44
                choice.tap()
                assert game.locator('.initialpick__feedback').is_visible()
                game.locator('[data-initial-act=next]').tap()
            assert len(set(seen))==total
            assert f'{total} / {total}' in game.inner_text()
            if week==1:assert not page.evaluate('examRecorded()')
            page.evaluate('dismissCelebration()')
            # Folding invalidates a delayed playback result; reopen starts fresh.
            page.evaluate('''()=>{WordAudio.play=word=>new Promise(resolve=>{window.finishInitialAudio=resolve});}''')
            game.locator('[data-initial-act=restart]').tap()
            step.locator('.step__hd').tap()
            page.evaluate("finishInitialAudio({status:'ended'})")
            step.locator('.step__hd').tap()
            assert game.locator('[data-initial-act=start]').is_visible()
            assert game.locator('[data-initial-letter]:not([disabled])').count()==0
            for width in [320,390,768]:
                page.set_viewport_size({'width':width,'height':844})
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            assert not errors,errors
            page.close()
            print(f'PASS W{week}: initial sound game, wrong/retry, failure, reveal, {total} rounds, fold cancellation and touch layout')
        browser.close()

if __name__=='__main__':run()
