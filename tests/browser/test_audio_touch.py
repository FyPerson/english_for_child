"""Touch layout and audio rejection/race regressions; not a physical iPad audio test."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
MOCK="""window.audioInstances=[];window.seekThrows=false;window.rejectPlay=false;
window.Audio=class {
 constructor(src){this.src=src;this.plays=0;this.playbackRate=1;audioInstances.push(this)}
 set currentTime(v){if(seekThrows)throw new DOMException('metadata unavailable','InvalidStateError')}
 pause(){}
 play(){this.plays++;return rejectPlay?Promise.reject(new DOMException('gesture required','NotAllowedError')):Promise.resolve()}
};"""
with sync_playwright() as p:
    engine=p.webkit if '--webkit' in sys.argv else p.chromium
    browser=engine.launch()
    for week in range(1,5):
        page=browser.new_page(viewport={'width':768,'height':1024},has_touch=True)
        page.add_init_script(MOCK)
        page.goto((ROOT/f'build/week{week:02}.html').as_uri())
        page.evaluate('seekThrows=true;Phone.say("s")')
        assert page.evaluate('audioInstances[0].plays')==1, 'seek failure must not prevent play'
        page.evaluate('rejectPlay=true;Phone.say("s")')
        page.locator('.audio-fail-bar--show').wait_for()
        page.evaluate('rejectPlay=false')
        page.locator('#audioFailBar').tap()
        assert page.evaluate('audioInstances[0].plays')==3
        assert page.locator('.audio-fail-bar--show').count()==0
        page.evaluate('oldError=audioInstances[0].onerror;AudioBus.stopAll();oldError()')
        assert page.locator('.audio-fail-bar--show').count()==0, 'cancelled audio must not resurrect retry'
        page.evaluate('seekThrows=false;first=WordAudio.play("sat",{rate:.65});audioInstances.at(-1).onended()')
        assert page.evaluate('first')['status']=='ended'
        count=page.evaluate('audioInstances.length')
        page.evaluate('void(second=WordAudio.play("sat"))')
        assert page.evaluate('audioInstances.length')==count, 'sequence must reuse authorized element'
        assert page.evaluate('audioInstances.at(-1).playbackRate')==1
        page.evaluate('third=WordAudio.play("sat");audioInstances.at(-1).onended()')
        assert page.evaluate('second')['status']=='cancelled'
        assert page.evaluate('third')['status']=='ended'
        page.evaluate('rejectPlay=true;blocked=WordAudio.play("sat")')
        assert page.evaluate('blocked')['status']=='failed'
        assert page.evaluate("[...document.querySelectorAll('button.tile[data-sayph]')].every(e=>{const s=getComputedStyle(e);return s.paddingLeft==='0px'&&s.paddingRight==='0px'&&s.textAlign==='center'&&s.alignItems==='center'&&s.justifyContent==='center'})")
        page.close()
        print(f'PASS week{week:02}: seek failure, retry tap, stale errors, player reuse, rate reset, cancellation, blocked audio, tile alignment')
    browser.close()


