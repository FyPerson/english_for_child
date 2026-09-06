"""Persistence failure, corrupt-state recovery and backup round trips in the real page."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for target in sorted(ROOT.glob('week[0-9][0-9].html')):
            page = browser.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(target.as_uri())
            key = page.evaluate('KEY')
            for damaged in [42, [], {'days': {'1': 1, '2': None, '3': {'checks': 'bad'}}}]:
                page.evaluate('([k,v])=>localStorage.setItem(k,JSON.stringify(v))', [key, damaged])
                page.reload()
                assert page.locator('.daycard').count() == 7
                assert page.evaluate('Object.values(state.days).every(d=>isPlainObject(d.checks))')
            page.evaluate("localStorage.setItem(KEY, '{broken')")
            page.reload()
            assert page.locator('#progressNotice').is_visible()
            assert page.evaluate('localStorage.getItem(KEY)') == '{broken'
            page.evaluate('localStorage.removeItem(KEY)')
            page.reload()
            page.locator('.dots [data-goto="1"]').click()
            page.locator('.step__hd').last.click()
            check = page.locator('[data-check]').first
            check_key = check.get_attribute('data-check')
            page.evaluate("()=>{window.realSet = Storage.prototype.setItem; Storage.prototype.setItem = ()=>{throw new Error('blocked')}}")
            check.click()
            assert page.locator('#progressNotice').is_visible()
            assert page.evaluate('progressDirty') is True
            page.evaluate('()=>{Storage.prototype.setItem = window.realSet}')
            page.locator('[data-progress-retry]').click()
            assert page.locator('#progressNotice').is_hidden()
            page.reload()
            assert page.evaluate('(k)=>state.days[1].checks[k]', check_key) is True
            backup = page.evaluate('progressBackup()')
            page.evaluate('state.days = cleanDays({}); save()')
            page.evaluate('(s)=>importProgress(parseProgressBackup(s))', json.dumps(backup))
            page.reload()
            assert page.evaluate('(k)=>state.days[1].checks[k]', check_key) is True
            for field, value in [('schemaVersion', 999), ('storageKey', 'other-week')]:
                invalid = {**backup, field: value}
                assert page.evaluate('(s)=>{try{parseProgressBackup(s);return false}catch(e){return true}}', json.dumps(invalid))
            # Real file-input preview and confirmation, including rejection without mutation.
            page.evaluate('openParentPanel()')
            page.locator('[data-import-progress]').set_input_files({'name': 'backup.json', 'mimeType': 'application/json', 'buffer': json.dumps(backup).encode()})
            page.locator('[data-import-confirm]').wait_for(state='visible')
            page.locator('[data-import-confirm]').click()
            assert page.locator('.daycard').count() == 7
            assert not errors, errors
            page.close()
            print(f'PASS {target.name}: corrupt state, failed save/retry, reload, backup and file import')
        browser.close()


if __name__ == '__main__':
    run()
