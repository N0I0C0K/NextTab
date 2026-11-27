"""Real Firefox MV3 favicon regression. See DEVELOPMENT.md for prerequisites."""
import argparse
import http.server
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import threading
import time
import zipfile

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service
from selenium.webdriver.support.ui import WebDriverWait

parser = argparse.ArgumentParser()
parser.add_argument('--firefox', required=True)
parser.add_argument('--geckodriver', required=True)
parser.add_argument('--extension', default='.output/firefox-mv3')
parser.add_argument('--output', default='artifacts/firefox-icons/current')
parser.add_argument('--expect-broken', action='store_true')
args = parser.parse_args()
out = Path(args.output).resolve()
out.mkdir(parents=True, exist_ok=True)
requests = []
# A real PNG from this repository; responses intentionally omit CORS headers.
png = Path('public/icon-32.png').read_bytes()

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        requests.append({'host': self.headers.get('Host'), 'path': self.path, 'referer': self.headers.get('Referer')})
        if self.path == '/favicon.ico' and self.headers.get('Host', '').startswith('localhost:'):
            self.send_error(404)
            return
        if self.path in ['/favicon.ico', '/assets/custom.png']:
            body, content_type = png, 'image/png'
        elif self.path.startswith('/bad-icon'):
            self.send_error(404)
            return
        else:
            icon = '/assets/custom.png'
            body = ('<!doctype html><title>Favicon fixture</title>'
                    f'<link rel="icon" href="{icon}">'
                    '<h1>Real Firefox favicon fixture</h1>').encode()
            content_type = 'text/html'
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *unused):
        pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
origin = f'http://127.0.0.1:{server.server_port}'
missing = f'http://localhost:{server.server_port}'
run = Path(tempfile.mkdtemp(prefix='profile-', dir=out))
env = os.environ.copy()
for name in ['HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_RUNTIME_DIR']:
    folder = run / name
    folder.mkdir(mode=0o700)
    env[name] = str(folder)
profile = run / 'firefox-profile'
profile.mkdir()
subprocess.run([args.firefox, '--headless', '--createprofile', f'NextTabFaviconQA {profile}'], env=env, check=True, timeout=30)
xpi = out / 'nexttab.xpi'
extension = Path(args.extension).resolve()
with zipfile.ZipFile(xpi, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in extension.rglob('*'):
        if file.is_file():
            archive.write(file, file.relative_to(extension))
options = Options()
options.binary_location = args.firefox
options.add_argument('--headless')
options.add_argument('--profile')
options.add_argument(str(profile))
options.accept_insecure_certs = False
# Model a desktop mouse in headless Firefox (fine pointer + hover).
options.set_preference('ui.primaryPointerCapabilities', 6)
service = Service(executable_path=args.geckodriver, log_output=str(out / 'geckodriver.log'), env=env)
driver = None
results = []

try:
    driver = webdriver.Firefox(options=options, service=service)
    driver.set_window_size(1440, 1000)
    driver.set_script_timeout(20)
    addon = driver.install_addon(str(xpi), temporary=True)
    print('FIREFOX', driver.capabilities['browserVersion'], 'ADDON', addon, flush=True)
    def extension_uuid(_):
        prefs = (profile / 'prefs.js').read_text()
        match = re.search(r'user_pref\("extensions.webextensions.uuids", (.*)\);', prefs)
        return json.loads(json.loads(match.group(1))).get(addon) if match else None
    uuid = WebDriverWait(driver, 20).until(extension_uuid)
    home = f'moz-extension://{uuid}/newtab.html'
    driver.get(home)
    wait = WebDriverWait(driver, 20)

    def js(script, *values):
        result = driver.execute_async_script('const done=arguments[arguments.length-1]; Promise.resolve().then(async()=>{' + script + '}).then(value=>done({value}),error=>done({error:String(error)}));', *values)
        assert 'error' not in result, result
        return result.get('value')

    def css(selector):
        return driver.find_element(By.CSS_SELECTOR, selector)

    def fill(selector, value):
        element = css(selector)
        element.click()
        element.send_keys(Keys.CONTROL, 'a')
        element.send_keys(value)

    def screenshot(name):
        time.sleep(0.5)
        driver.save_screenshot(str(out / name))

    def passed(name):
        results.append(name)
        print('PASS', name, flush=True)

    def image_loaded(selector):
        return driver.execute_script('const i=document.querySelector(arguments[0]); return !!i && i.complete && i.naturalWidth>0;', selector)

    def check_loaded(selector, name):
        wait.until(lambda _: image_loaded(selector))
        assert '/_favicon/' not in css(selector).get_attribute('src')
        passed(name)

    def set_links(links):
        js("await browser.storage.local.set({'quick-url-item-storage-key':arguments[0]});", links)

    js("await browser.storage.local.set({'onboarding-completed-key':true,'settings-storage':{autoFocusCommandInput:false,showRecentPages:false,showBookmarksInQuickUrlMenu:true,showOpenTabsInQuickUrlMenu:true}});")
    set_links([{'id': 'origin', 'title': 'Origin icon', 'url': origin + '/deep/page?private=1'},
               {'id': 'missing', 'title': 'Missing icon', 'url': missing + '/deep/page'}])
    driver.refresh()
    wait.until(lambda _: len(driver.find_elements(By.CSS_SELECTOR, '[data-testid="quick-link-card"]')) == 2)
    card = '[data-testid="quick-link-card"]'
    if args.expect_broken:
        wait.until(lambda _: css(card + ' .nt-link-icon').get_attribute('data-icon-status') == 'fallback')
        assert not image_loaded(card + ' img')
        screenshot('before.png')
        passed('baseline reproduces initial fallback although origin favicon exists')
    else:
        check_loaded(card + ' .nt-link-icon img', 'saved site: non-CORS origin favicon decodes')
        wait.until(lambda _: driver.find_elements(By.CSS_SELECTOR, card + ' .nt-link-icon')[1].get_attribute('data-icon-status') == 'fallback')
        assert driver.find_elements(By.CSS_SELECTOR, card + ' .nt-link-icon')[1].text == 'M'
        passed('404 favicon falls back to initial')
        screenshot('home.png')
        initial_requests = len(requests)
        time.sleep(1)
        assert len(requests) == initial_requests, requests
        passed('failed icon settles without a request loop')

        # Updating an existing saved item's URL must discard its failure state.
        set_links([{'id': 'missing', 'title': 'Recovered icon', 'url': origin + '/recovered'}])
        wait.until(lambda _: len(driver.find_elements(By.CSS_SELECTOR, card)) == 1 and 'Recovered icon' in css(card).text)
        check_loaded(card + ' .nt-link-icon img', 'changing URL after failure loads the new icon')

        # Use an actual page/tab with a non-root favicon, not a browser API stub.
        tab_url = origin + '/custom-tab'
        tab_id = js('return (await browser.tabs.create({url:arguments[0],active:true})).id;', tab_url)
        js('await browser.tabs.update((await browser.tabs.getCurrent()).id,{active:true});')
        tab_icon = wait.until(lambda _: js('return (await browser.tabs.get(arguments[0])).favIconUrl;', tab_id))
        assert any(item['path'] == '/assets/custom.png' for item in requests)
        set_links([{'id': 'custom', 'title': 'Custom tab icon', 'url': tab_url}])
        wait.until(lambda _: image_loaded(card + ' .nt-link-icon img') and css(card + ' .nt-link-icon img').get_attribute('src') == tab_icon)
        passed('saved site prefers actual open tab non-root favicon')

        # Seed real bookmarks/history through their APIs; rendered application remains unchanged.
        js("for(let i=0;i<12;i++) await browser.bookmarks.create({title:'Favicon bookmark '+i,url:arguments[0]+'/bookmark/'+i});", origin)
        js("for(let i=0;i<12;i++) await browser.history.addUrl({title:'Favicon history '+i,url:arguments[0]+'/history/'+i});", origin)
        css('[data-testid="command-shortcut-bookmarks"]').click()
        fill('[data-testid="command-input"]', 'Favicon bookmark')
        check_loaded('[data-testid="command-result"] img', 'bookmark search preview favicon')
        css('[data-testid="command-group-action"]').click()
        check_loaded('[data-testid="navigation-row"] img', 'full bookmark list favicon')
        screenshot('bookmarks.png')
        css('[data-testid="search-results-dialog"] input').send_keys(Keys.ESCAPE)
        css('[data-testid="command-shortcut-history"]').click()
        fill('[data-testid="command-input"]', '/history/')
        check_loaded('[data-testid="command-result"] img', 'history search preview favicon')
        css('[data-testid="command-group-action"]').click()
        check_loaded('[data-testid="navigation-row"] img', 'full history list favicon')
        css('[data-testid="search-results-dialog"] input').send_keys(Keys.ESCAPE)
        css('[data-testid="command-shortcut-tabs"]').click()
        fill('[data-testid="command-input"]', '/custom-tab')
        check_loaded('[data-testid="command-result"] img', 'tab search real favicon')
        assert css('[data-testid="command-result"] img').get_attribute('src') == tab_icon
        screenshot('tab-search.png')

        css('[data-testid="command-input"]').send_keys(Keys.ESCAPE)
        ActionChains(driver).context_click(css(card)).perform()
        check_loaded('[data-testid="related-bookmark"] img', 'site context menu related bookmark favicon')
        check_loaded('[data-testid="related-tab"] img', 'site context menu related tab favicon')
        screenshot('context-menu.png')
        css('[data-testid="quick-link-history"]').click()
        check_loaded('[data-testid="domain-history-item"] img', 'site history dialog favicon')
        screenshot('domain-history.png')

        js("window.location.href=browser.runtime.getURL('popup.html');")
        check_loaded('[data-testid="popup-quick-link"] img', 'popup saved site favicon')
        screenshot('popup.png')
        assert all(not item['referer'] for item in requests if item['path'] == '/favicon.ico'), requests
        passed('origin fallback requests omit Referer and page query')

    (out / 'results.json').write_text(json.dumps({'firefox': driver.capabilities['browserVersion'], 'extension': str(extension), 'checks': results, 'requests': requests}, indent=2))
except Exception:
    (out / 'failure-requests.json').write_text(json.dumps(requests, indent=2))
    if driver:
        try:
            print('TABS', js('return (await browser.tabs.query({})).map(({id,url,title,status,favIconUrl})=>({id,url,title,status,iconPrefix:favIconUrl?.slice(0,50)}));'), flush=True)
        except Exception:
            pass
        screenshot('failure.png')
        (out / 'failure-body.txt').write_text(driver.find_element(By.TAG_NAME, 'body').text)
    raise
finally:
    if driver:
        driver.quit()
    server.shutdown()
