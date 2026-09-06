"""HTTP/mobile/offline browser checks. Touch emulation is not a physical iOS test."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    shots = ROOT/'test-results/screenshots/reliability-mobile'
    shots.mkdir(parents=True, exist_ok=True)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for target in sorted(ROOT.glob('week[0-9][0-9].html')):
                for width in [320,390,768,1280]:
                    context = browser.new_context(viewport={'width':width,'height':844},has_touch=True,is_mobile=width<768)
                    page=context.new_page()
                    errors=[]
                    requests=[]
                    page.on('pageerror',lambda e: errors.append(str(e)))
                    page.on('request',lambda r: requests.append(r.url))
                    page.goto(f'{base}/{target.name}')
                    for n in range(8):
                        if n:
                            page.locator(f'.dots [data-goto="{n}"]').tap()
                            for step in page.locator('.step').all():
                                if not step.locator('.step__body').is_visible(): step.locator('.step__hd').tap()
                        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'), (target.name,width,n,'overflow')
                        assert 'undefined' not in page.locator('#app').inner_text()
                        assert page.evaluate('[...document.images].filter(i=>i.offsetParent!==null).every(i=>i.complete&&i.naturalWidth>0)'),(target.name,width,n,'broken image')
                        if n in [0,7] and width in [390,1280]:
                            page.screenshot(path=str(shots/f'{target.stem}-{width}-day{n}.png'),full_page=True)
                    # Tap an order and a tile; tap the slot to return it.
                    page.evaluate("()=>{WordAudio.play=()=>Promise.resolve({status:'ended'})}")
                    g4=page.locator('[data-g4]')
                    order=g4.locator('[data-g4-order]').first
                    word=order.get_attribute('data-g4-order')
                    order.tap()
                    tile=g4.locator(f'[data-g4-letter="{word[0]}"]').first
                    tile.wait_for()
                    box=tile.bounding_box()
                    assert box['width']>=44 and box['height']>=44
                    tile.tap()
                    g4.locator('[data-g4-slot]').first.tap()
                    assert g4.locator('[data-g4-tile][disabled]').count()==0
                    # HTTP entry followed by offline navigation: all media remain in the file.
                    context.set_offline(True)
                    page.locator('[data-goto="0"]').first.tap()
                    page.locator('[data-goto="wall"]').first.tap()
                    assert page.locator('.wcard').count()>0
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
                    assert all(url.startswith(base+'/') or url.startswith(('data:','blob:')) for url in requests), requests
                    assert not errors,errors
                    context.close()
                print(f'PASS {target.name}: HTTP, 320/390/768/1280px, all days, touch place/undo and offline navigation')
            browser.close()
    finally:
        server.shutdown();server.server_close()


if __name__=='__main__':
    run()
