# urlwatch 跑剧本（行家配置：CSS 过滤、整页去掉时钟和在看人数、脚本页用浏览器、要登录的页手抄 Cookie）。
# urlwatch 没有「低于多少才叫」这种条件，只能内容一变就叫。先起 site.js 8790，再 python3 run_urlwatch.py
import json, os, re, subprocess, tempfile, yaml

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = 'http://localhost:8790'
W = json.loads(subprocess.check_output(['node', '-e', "console.log(JSON.stringify(require('%s/scenario.js')))" % HERE]))
SEL = {'W1': '.price', 'W2': '#stock', 'W3': '.seats', 'W5': '.price', 'W6': '.price', 'W7': '#status', 'W8': '.price', 'W9': '.price'}

def get(p):
    import urllib.request
    return urllib.request.urlopen(BASE + p, timeout=10).read()

def main():
    d = tempfile.mkdtemp(prefix='uw-')
    jobs = []
    for w in W['W']:
        key = 'W9' if w['id'].startswith('W9') else w['id']
        j = {'name': w['id'], 'url': BASE + w['path']}
        f = []
        if key in SEL: f.append({'css': SEL[key]})
        f.append('html2text')
        if key == 'W4': f.append({'re.sub': {'pattern': r'现在 .* 人在看', 'repl': ''}})
        j['filter'] = f
        if key == 'W3': j = {'name': w['id'], 'navigate': BASE + w['path'], 'wait_for': '.seats', 'filter': f}
        if key == 'W7': j['headers'] = {'Cookie': 'sid=ok'}
        jobs.append(j)
    open(d + '/urls.yaml', 'w').write(yaml.safe_dump_all(jobs, allow_unicode=True))
    cfg = {'display': {'new': False, 'error': True, 'unchanged': False, 'empty-diff': False},
           'report': {'text': {'details': False, 'footer': False, 'line_length': 200}, 'stdout': {'enabled': True, 'color': False},
                      'html': {'diff': 'unified'}, 'markdown': {'details': False, 'footer': False},
                      'email': {'enabled': False}}}
    open(d + '/urlwatch.yaml', 'w').write(yaml.safe_dump(cfg))
    run = lambda: subprocess.run(['urlwatch', '--urls', d + '/urls.yaml', '--config', d + '/urlwatch.yaml', '--cache', d + '/cache.db', '--hooks', d + '/hooks.py'],
                                 capture_output=True, text=True, timeout=300, env=dict(os.environ, NO_PROXY='localhost,127.0.0.1')).stdout
    get('/_step?k=0'); run()
    out = {w['id']: [] for w in W['W']}
    for k in range(1, W['STEPS']):
        get('/_step?k=%d' % k)
        rep = run()
        changed = set(re.findall(r'^\s*\d*\.?\s*CHANGED: (\S+)', rep, re.M))
        errs = set(re.findall(r'^\s*\d*\.?\s*ERROR: (\S+)', rep, re.M))
        for w in W['W']:
            out[w['id']].append('alert' if w['id'] in changed else 'err' if w['id'] in errs else 'same')
        print('step', k, sorted(changed), 'err', sorted(errs), flush=True)
    json.dump({'tool': 'urlwatch 2.29（行家配置）', 'steps': out}, open(HERE + '/results/urlwatch.json', 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
