"""All six games: deterministic audio and browser clock, real DOM input, persistence."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]


def stub(page):
    page.evaluate("""()=>{window.audioStatus='ended'; WordAudio.play = key=>{
      window.lastWord=key; if(window.audioStatus==='ended') hideAudioFailure();
      return Promise.resolve({status:window.audioStatus});
    };} """)
    page.add_style_tag(content='*,*::before,*::after{animation:none!important;transition:none!important}')


def day(page, n):
    page.locator(f'.dots [data-goto="{n}"]').click()
    page.clock.run_for(50)
    for step in page.locator('.step').all():
        if not step.locator('.step__body').is_visible():
            step.locator('.step__hd').click()


def hold(page, locator, duration=1100):
    locator.focus()
    page.keyboard.down('Space')
    page.clock.run_for(duration)
    page.keyboard.up('Space')


def persisted(page):
    return page.evaluate('JSON.parse(localStorage.getItem(KEY)).games')


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for target in sorted((ROOT/'build').glob('week[0-9][0-9].html')):
            page = browser.new_page()
            page.clock.install(time=1_780_000_000_000)
            page.clock.pause_at(1_780_000_000_000)
            errors = []
            page.on('pageerror', lambda e: (errors.append(str(e)), print('PAGE ERROR', str(e), flush=True)))
            page.goto(target.as_uri())
            stub(page)
            find = lambda kind: page.evaluate('(kind)=>DAYS.find(d=>d.steps.some(s=>s.blocks.some(b=>b.b===kind))).n', kind)
            # G1: failed audio/resume, eight exact answers, persisted score, no double counting.
            day(page, find('g1'))
            g1 = page.locator('[data-g1-round]').first
            key = g1.get_attribute('data-g1-round')
            page.evaluate("window.audioStatus='failed'")
            g1.locator('[data-g1-act=start]').click()
            g1.locator('[data-g1-act=resume]').wait_for()
            page.evaluate("window.audioStatus='ended'")
            g1.locator('[data-g1-act=resume]').click()
            for _ in range(8):
                g1.locator('[data-g1-act=tap]').wait_for()
                positive = page.evaluate('(k)=>G1_ROUNDS[k].pos.includes(window.lastWord)', key)
                if positive:
                    g1.locator('[data-g1-act=tap]').click()
                else:
                    page.clock.run_for(page.evaluate('ANSWER_WINDOW_MS'))
                page.clock.run_for(950)
            assert '8 / 8' in g1.inner_text()
            assert persisted(page)['grab'][key]['best'] == 8
            page.clock.run_for(5000)
            assert persisted(page)['grab'][key]['best'] == 8
            page.evaluate('dismissCelebration()')
            # G2: cancel a partial hold, then confirm every word and reach bounded completion.
            day(page, find('blend'))
            g2 = page.locator('[data-g2]').first
            assert g2.count(), page.locator('#app').inner_text()[:300]
            words = g2.get_attribute('data-g2').split(',')
            for i, word in enumerate(words):
                g2.locator('[data-act=merge]').click()
                confirm = g2.locator('[data-act=confirm]')
                if i == 0:
                    hold(page, confirm, 500)
                    page.clock.run_for(700)
                    assert not page.evaluate('(w)=>!!state.games.confirms[w]?.g2', word)
                hold(page, confirm)
                assert persisted(page)['confirms'][word]['g2'] is True
                g2.locator('[data-act=finish]' if i == len(words)-1 else '[data-act=next]').click()
            assert g2.locator('[data-act=restart]').count() == 1
            # G3: choose the actually played word on each of ten questions.
            day(page, find('pair'))
            g3 = page.locator('[data-g3-pair]').first
            g3.locator('[data-g3-act=start]').click()
            for _ in range(10):
                g3.locator('[data-g3-door]:not([disabled])').first.wait_for()
                word = page.evaluate('window.lastWord')
                g3.locator(f'[data-g3-door="{word}"]').click()
                page.clock.run_for(950)
            assert persisted(page)['doors']['best'] == 10
            page.evaluate('dismissCelebration()')
            # G4: place/retract/re-place, confirm, and revoke only this source.
            day(page, find('g4'))
            g4 = page.locator('[data-g4]').first
            order = g4.locator('[data-g4-order]').first
            word4 = order.get_attribute('data-g4-order')
            order.click()
            g4.locator('[data-g4-tile]').first.wait_for()
            g4.locator(f'[data-g4-letter="{word4[0]}"]').first.click()
            g4.locator('[data-g4-slot]').first.click()
            assert g4.locator('[data-g4-tile][disabled]').count() == 0
            for ch in word4:
                g4.locator(f'[data-g4-letter="{ch}"]:not([disabled])').first.click()
            hold(page,g4.locator('.g4__confirm'))
            assert persisted(page)['confirms'][word4]['g4'] is True
            g4.locator('[data-g4-act=unconfirm]').click()
            assert persisted(page)['confirms'][word4]['g4'] is False
            hold(page,g4.locator('.g4__confirm'))
            # G5: real unlock, clear slots, re-place and confirm.
            exam_key = page.evaluate("()=>{const d=DAYS.find(d=>d.steps.some(s=>s.blocks.some(b=>b.b==='exam')));const i=d.steps.findIndex(s=>s.blocks.some(b=>b.b==='exam'));return d.n+'-'+i+'-0'}")
            page.locator(f'[data-check="{exam_key}"]').click()
            g5=page.locator('[data-g5]').first
            word5=page.evaluate('G5_WHITELIST.find(w=>w.length===3 && new Set(w).size===3)')
            for ch in word5:
                g5.locator(f'[data-g5-letter="{ch}"]:not([disabled])').first.click()
            g5.locator('[data-g5-act=clear]').click()
            assert g5.locator('[data-g5-tile][disabled]').count() == 0
            for ch in word5:
                g5.locator(f'[data-g5-letter="{ch}"]:not([disabled])').first.click()
            hold(page,g5.locator('.g5__confirm'))
            assert persisted(page)['confirms'][word5]['g5'] is True
            # G6: abort never records; finishing words and sound stopwatch both persist.
            flashday = lambda key: page.evaluate('(key)=>DAYS.find(d=>d.steps.some(s=>s.blocks.some(b=>b.recKey===key))).n',key)
            day(page,flashday('flash_words'))
            flash=page.locator('[data-reckey=flash_words]').first
            flash.locator('[data-act=timer]').click()
            page.clock.run_for(2000)
            flash.locator('[data-act=timer]').click()
            assert not page.evaluate('state.games.flash.flash_words')
            flash.locator('[data-act=timer]').click()
            count=page.evaluate('(s)=>JSON.parse(s).length',flash.get_attribute('data-items'))
            for _ in range(count): flash.locator('[data-act=next]').click()
            assert persisted(page)['flash']['flash_words']['value']==count
            page.evaluate('dismissCelebration()')
            day(page,flashday('flash_sounds'))
            flash=page.locator('[data-reckey=flash_sounds]').first
            flash.locator('[data-act=timer]').click()
            page.clock.run_for(12300)
            flash.locator('[data-act=timer]').click()
            assert persisted(page)['flash']['flash_sounds']['value']==12.3
            saved=persisted(page)
            page.reload()
            restored = page.evaluate('state.games')
            for group in ['grab','doors','flash']:
                assert restored[group] == saved[group], (group, restored[group], saved[group])
            for word, sources in saved['confirms'].items():
                for source in ['g2','g4','g5']:
                    assert bool(restored['confirms'][word].get(source)) == bool(sources.get(source))
            assert not errors,errors
            page.close()
            print(f'PASS {target.name}: G1-G6 completion, failure/retry, undo, interrupted hold, abort and refresh')
        browser.close()


if __name__ == '__main__':
    run()
