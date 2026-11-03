# changedetection.io 跑剧本：两套配置一起跑。
#   nov  = 照界面最顺的路：填网址 + CSS 选择器 + 条件，其余默认
#   pro  = 行家配置：脚本页改用浏览器抓取、整页加忽略规则、要登录的页手抄 Cookie
# 先起测试网站（node site.js 8790），再：python3 run_cdio.py   结果 → results/cdio-nov.json / cdio-pro.json
import json, os, subprocess, sys, time, tempfile, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
BASE = 'http://localhost:8790'
CD = 'http://127.0.0.1:5055'
CHROME = os.environ.get('CHROME', '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome')

W = json.loads(subprocess.check_output(['node', '-e', "console.log(JSON.stringify(require('%s/scenario.js')))" % HERE]))
STEPS = W['STEPS']; WATCHES = W['W']

SEL = {'W1': '.price', 'W2': '#stock', 'W3': '.seats', 'W5': '.price', 'W6': '.price', 'W7': '#status', 'W8': '.price', 'W9': '.price'}
NUM = lambda op, v: [{'field': 'extracted_number', 'operator': op, 'value': v}]
COND = {'W1': NUM('<', '1000'), 'W2': [{'field': 'page_filtered_text', 'operator': '!in', 'value': '缺货'}], 'W3': NUM('>', '0'),
        'W6': NUM('<', '420'), 'W8': NUM('<', '500'), 'W9': NUM('<', '100')}

def http(method, url, body=None, key=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header('content-type', 'application/json')
    if key: req.add_header('x-api-key', key)
    with urllib.request.urlopen(req, timeout=30) as r:
        t = r.read().decode()
        try: return json.loads(t)
        except Exception: return t

def config(w, prof):
    key = 'W9' if w['id'].startswith('W9') else w['id']
    c = {'url': BASE + w['path'], 'title': w['id'], 'notification_urls': ['json://localhost:8790/hook/%s-%s' % (prof, w['id'])],
         'time_between_check': {'hours': 3}}
    if key in SEL: c['include_filters'] = [SEL[key]]
    if key in COND: c['conditions'] = COND[key]; c['conditions_match_logic'] = 'ALL'
    if prof == 'pro':
        if key == 'W3': c['fetch_backend'] = 'html_webdriver'
        if key == 'W4': c['ignore_text'] = ['/现在 .* 人在看/']
        if key == 'W7': c['headers'] = {'Cookie': 'sid=ok'}
    return c

def main():
    data = tempfile.mkdtemp(prefix='cdio-')
    chrome = subprocess.Popen([CHROME, '--headless=new', '--remote-debugging-port=9333', '--no-sandbox', '--user-data-dir=' + tempfile.mkdtemp()], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    env = dict(os.environ, ALLOW_IANA_RESTRICTED_ADDRESSES='true', PLAYWRIGHT_DRIVER_URL='http://127.0.0.1:9333')
    cd = subprocess.Popen(['changedetection.io', '-d', data, '-p', '5055', '-h', '127.0.0.1'], env=env, stdout=open(data + '/log.txt', 'w'), stderr=subprocess.STDOUT)
    try:
        for _ in range(60):
            try: http('GET', CD + '/'); break
            except Exception: time.sleep(1)
        key = json.load(open(data + '/changedetection.json'))['settings']['application']['api_access_token']
        http('GET', BASE + '/_step?k=0')
        for u in list(http('GET', CD + '/api/v1/watch', key=key).keys()):  # 删掉自带的两条外网示例
            http('DELETE', CD + '/api/v1/watch/' + u, key=key)
        ids = {}
        for prof in ('nov', 'pro'):
            for w in WATCHES:
                r = http('POST', CD + '/api/v1/watch', config(w, prof), key)
                ids[(prof, w['id'])] = r['uuid'] if isinstance(r, dict) else r.strip()
        def round_all(t0):
            for u in ids.values(): http('GET', CD + '/api/v1/watch/%s?recheck=1' % u, key=key)
            deadline = time.time() + 90
            while True:
                st = {k: http('GET', CD + '/api/v1/watch/' + u, key=key) for k, u in ids.items()}
                late = [k for k, s in st.items() if (s.get('last_checked') or 0) < int(t0)]
                if not late: return st
                if time.time() > deadline:
                    print('  没查完:', late, flush=True); return st
                time.sleep(2)
        round_all(time.time() - 0.5)
        time.sleep(3)
        seen = len(http('GET', BASE + '/_hooks'))
        out = {p: {w['id']: [] for w in WATCHES} for p in ('nov', 'pro')}
        for k in range(1, STEPS):
            http('GET', BASE + '/_step?k=%d' % k)
            t0 = time.time()
            st = round_all(t0)
            time.sleep(8)  # 等通知发出
            hooks = http('GET', BASE + '/_hooks'); new = hooks[seen:]; seen = len(hooks)
            got = {h['name'] for h in new if 'had a change' in h['body']}  # 只算「变了」的通知
            warn = {h['name'] for h in new if 'filter was not present' in h['body']}  # 「选择器找不到了」的提醒另记
            for (prof, wid), u in ids.items():
                s = st[(prof, wid)]
                if '%s-%s' % (prof, wid) in got: v = 'alert'
                elif '%s-%s' % (prof, wid) in warn: v = 'warn:filter-missing'
                elif s.get('last_error'): v = 'err:' + str(s['last_error'])[:60]
                else: v = 'same'
                out[prof][wid].append(v)
            print('step', k, ' '.join('%s:%s=%s' % (p, w, out[p][w][-1][:14]) for p in out for w in out[p]), flush=True)
        os.makedirs(HERE + '/results', exist_ok=True)
        for p, name in (('nov', 'changedetection.io 0.60.10（照界面默认）'), ('pro', 'changedetection.io 0.60.10（行家配置）')):
            json.dump({'tool': name, 'steps': out[p]}, open(HERE + '/results/cdio-%s.json' % p, 'w'), ensure_ascii=False, indent=1)
    finally:
        cd.terminate(); chrome.terminate()

if __name__ == '__main__':
    main()
