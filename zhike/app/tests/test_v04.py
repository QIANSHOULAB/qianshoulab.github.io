"""0.4：字。中英两套（默认英文，第二语言中文），设置里切、记住；托盘、气泡、拟规则的名字和列名、Excel 表头、默认模板、
转发信头都跟着语言；英文界面的按钮不被长单词撑破、不挤成两行、字不截断。老测试照中文写（conftest 设了 ZHIKE_LANG=zh），这里测英文和切换。"""
import json
import re
import subprocess
import threading
from pathlib import Path

import pytest
from openpyxl import load_workbook

from zhike import learn, recommend as RC, rules as R, samples, text
from zhike.api import Api
from zhike.mailbox import build_forward
from zhike.mailparse import parse
from zhike.store import Store
from conftest import make_mail

UI = Path(__file__).resolve().parents[1] / "ui"
BENCH = Path(__file__).resolve().parents[2] / "bench" / "samples"


def train():
    return [parse(f.read_bytes(), uid=i + 1) for i, f in enumerate(sorted(BENCH.glob("t*.eml")))]


# ---------- 字只放一处，两套对得上 ----------
def test_strings_both_languages_complete():
    d = text.load()
    en = {k for k in d["en"] if not k.endswith("_1")}
    assert en == set(d["zh"]) and len(en) > 250
    # 占位 {x} 两套一样（模板说明、默认模板里的 {称呼}/{name} 是给人看的字，不算）
    free = {"reply_tpl_note", "tpl_default", "q"}
    for k in en - free:
        assert set(re.findall(r"\{(\w+)\}", d["en"][k])) == set(re.findall(r"\{(\w+)\}", d["zh"][k])), k
    # 界面里 t("…") 用到的键都在
    js = (UI / "app.js").read_text("utf-8")
    used = set(re.findall(r'\bt\("([a-z0-9_]+)"', js))
    assert not {k for k in used if k not in d["en"] and not k.endswith("_")}, used - set(d["en"])
    # Python 读出来的跟浏览器里一样
    try:
        out = subprocess.run(["node", "-e", "global.window=global;require(process.argv[1]);console.log(JSON.stringify(STR))",
                              str(UI / "strings.js")], capture_output=True, encoding="utf-8", timeout=30)
    except FileNotFoundError:
        pytest.skip("no node")
    assert json.loads(out.stdout) == d


def test_no_disclaimers_or_translationese():
    d = text.load()
    for k, v in d["zh"].items():
        assert not re.search(r"仅供参考|免责|不保证|风险自负|请注意|请确认|建议你先|您的.*已被成功|进行.*操作|请点击", v), k
    for k, v in d["en"].items():
        assert not re.search(r"(?i)please kindly|operation succeeded|click here|disclaimer|not responsible|for reference only", v), k


def test_english_buttons_are_short():
    """按钮英文 1–3 个词（按钮用的键）。"""
    d = text.load()["en"]
    keys = [k for k in d if k.startswith("btn_") and not k.endswith("_1")] + ["try_demo", "demo_btn", "acc_add", "acc_remove",
                                                                              "acc_fix_pw", "acc_samples", "ms_btn", "ms_relogin"]
    for k in keys:
        words = re.sub(r"\{\w+\}", "N", d[k]).split()
        assert 1 <= len(words) <= 3, (k, d[k])


# ---------- 默认英文、记住选择 ----------
def test_default_english_and_remembered(home, monkeypatch):
    monkeypatch.delenv("ZHIKE_LANG")
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: Path(home)))     # 默认 Excel 路径落在临时目录
    api = Api()
    assert api.boot()["lang"] == "en" and api.store.settings["excel_path"].endswith("Zhike.xlsx")
    assert api.set_lang("zh") == "zh"
    assert api.store.settings["excel_path"].endswith("知客僧.xlsx")        # 还没写过：默认文件名跟着换
    again = Store()
    assert again.lang == "zh"                                             # 下次打开直接是上次选的
    api.engine.stop()


def test_upgrader_from_03_stays_chinese(home, monkeypatch):
    """0.3 升上来、已经连着邮箱用中文的：没选过语言就接着中文，不一升级满屏换字。"""
    monkeypatch.delenv("ZHIKE_LANG")
    root = Path(home) / "home"
    root.mkdir(parents=True, exist_ok=True)
    (root / "config.json").write_text(json.dumps({"accounts": [{"id": "a1", "email": "me@x.example"}],
                                                  "rules": [], "settings": {"interval_sec": 120}}), "utf-8")
    assert Store().lang == "zh"


# ---------- 拟规则：名字、列名跟着语言，认法一样 ----------
def test_recommend_english_names_same_logic():
    ms = train()
    zh = {r["id"]: r for r in RC.recommend(ms, [], lang="zh")}
    en = {r["id"]: r for r in RC.recommend(ms, [], lang="en")}
    assert set(zh) == set(en)                                   # 同一条拟稿同一个号：中文时点的「不要」，英文时也记着
    names = {r["name"] for r in en.values()}
    assert names == {"Orders", "Invoices", "Shipping", "Quotes"}
    o = next(r for r in en.values() if r["name"] == "Orders")
    assert [f["name"] for f in o["fields"]] == ["Order #", "Order date", "Amount"]
    assert o["conditions"] == zh[o["id"]]["conditions"]
    rule = RC.to_rule(o, {m.key(): m for m in ms})
    assert [f["name"] for f in rule["fields"]][:2] == ["Received", "From"]
    inv = RC.to_rule(next(r for r in en.values() if r["name"] == "Invoices"), {m.key(): m for m in ms})
    assert inv["fields"][-1] == {"name": "Attachments", "builtin": "@attachments", "type": "text"}


def test_extend_works_across_languages(home, imap, smtp):
    """中文时收下的「发票」，切到英文后来了新的一家：照样拟成「归进发票」，列名照老规则的（Excel 表头不变）。"""
    from test_v03 import NEW_SUPPLIER, ov
    for m in train():
        imap.deliver(m.raw)
    api = Api()
    api.store.settings["excel_path"] = str(Path(home) / "out" / "知客僧.xlsx")
    api.add_account(imap.user, imap.password, ov(imap, smtp))
    api.accept_recs([{"id": r["id"]} for r in api.recs()])
    api.set_lang("en")
    imap.deliver(NEW_SUPPLIER)
    api.engine.run_once()
    recs = api.recs()
    assert len(recs) == 1 and recs[0]["kind"] == "extend" and recs[0]["name"] == "发票"
    out = api.accept_recs([{"id": recs[0]["id"]}])
    assert out["extended"] == 1 and out["caught_up"] == 1
    inv = next(r for r in api.store.rules if r["name"] == "发票")
    assert [f["name"] for f in inv["fields"] if not f.get("builtin")] == ["发票号", "金额", "到期日"]
    rows = list(load_workbook(api.store.settings["excel_path"])["发票"].iter_rows(values_only=True))
    assert rows[-1][2:4] == ("BT-2026-118", 1234)
    api.engine.stop()


# ---------- Python 那边说的话 ----------
def test_english_texts_from_python(env):
    store, eng = env["store"], env["eng"]
    store.settings["lang"] = "en"
    told = []
    api = Api(store, eng, notify=lambda t, b: told.append((t, b)))
    eng.on_change = api._changed
    store.rules[2]["reply"]["mode"] = "template"
    env["imap"].deliver(make_mail("想问下 A4 纸的价", "电话：9123 4567\n要 200 箱", frm="陈先生 <chen@example.com>"))
    eng.run_once()
    assert told and told[0][0] == "Zhike" and told[0][1].startswith("A reply draft is ready")
    # 新规则、内置列、默认模板、转发信头
    r = api.new_rule()
    assert r["name"] == "New rule" and [f["name"] for f in r["fields"]] == ["Received", "From"]
    assert api.add_builtin(r["id"], "@subject")["fields"][-1]["name"] == "Subject"
    m = parse(make_mail("Order 1", "Order #: A1", frm="Shop <orders@shop.example>"))
    body = build_forward(m, "me@x.example", ["boss@x.example"], "", "en").get_content()
    assert "---------- Forwarded message ----------" in body and "From: Shop <orders@shop.example>" in body
    assert parse(build_forward(m, "me@x.example", ["b@x.example"], "", "en").as_bytes()).orig_from == "orders@shop.example"
    tpl = text.T("tpl_default", "en")
    from zhike import ai
    assert ai.fill_template(tpl, m, {}).startswith("Hi Shop,")
    assert text.T("n_recs", "en", n=2, r="Orders, Invoices") == "A new kind of email showed up. Zhike drafted 2 rules: Orders, Invoices. Your call."
    eng.stop()


def test_demo_follows_language(home):
    api = Api()
    api.set_lang("en")
    b = api.boot()
    assert b["demo"] and [r["name"] for r in b["rules"]] == ["Orders", "Invoices", "Quotes"]
    subs = [m["subject"] for m in api.mails()]
    assert "Invoice INV-88213 from Bluepeak Supplies" in subs and any(s.startswith("Order confirmed") for s in subs)
    assert api.drafts()[0]["body"].startswith("Hi Kelvin Tan,")
    assert [c for c in api.table(b["rules"][0]["id"])["columns"]][:3] == ["Received", "From", "Order #"]
    api.set_lang("zh")
    assert [r["name"] for r in api.boot()["rules"]] == ["订单", "发票", "询价"]
    api.engine.stop()


def test_samples_have_no_temple_shop_names():
    """示例数据里别拿佛门典故配买卖做名字（山门、莲花、白塔……）。"""
    for L in ("zh", "en"):
        blob = b"".join(samples.raw_samples(L)).decode("utf-8", "replace") + json.dumps(samples.demo_rules(lang=L), ensure_ascii=False)
        assert not re.search(r"(?i)山门|shanmen|lotus|莲|白塔|baita|寺|禅|佛", blob), L


# ---------- 界面真流程：英文（没装 Playwright 就跳过这两个；CI 的 Windows 机器上不装，上面那些照跑） ----------
try:
    import playwright.sync_api as pw
except ImportError:
    pw = None
needs_pw = pytest.mark.skipif(pw is None, reason="no playwright")

OVERFLOW_JS = """() => {
  const bad = [];
  const sel = '.btn,.seg button,.nav-i span,.chip,.toast,.toast-act,.tag,.typ,.bar h1,.rec-t span,.claim-h b,.kv span,.row .k,.li-from,.grp-h h2,.badge';
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
    // 挤成两行：按钮、标签里的字（文字节点）落在不止一行上
    let wrapped = false;
    if (el.matches('.btn,.seg button,.chip,.toast-act,.tag,.typ,.badge,.nav-i span')) {
      const tops = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.textContent.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const q of rg.getClientRects()) if (!tops.some((t) => Math.abs(t - q.top) < 6)) tops.push(q.top);
      }
      wrapped = tops.length > 1;
    }
    // 撑破 / 截断：字比框宽（按钮的 ::after 扩点击区不算，所以看的是不带溢出的文字宽）
    const cut = getComputedStyle(el).overflow !== 'visible' || el.matches('.bar h1,.li-from,.kv span,.rec-t span')
      ? el.scrollWidth > el.clientWidth + 1 : false;
    const burst = el.matches('.btn,.seg button,.chip,.toast-act,.tag,.typ') && (() => {
      const rg = document.createRange(); rg.selectNodeContents(el); const t = rg.getBoundingClientRect();
      const pr = el.parentElement.getBoundingClientRect();
      return t.width > r.width + 1 || r.right > pr.right + 1 || r.left < pr.left - 1 || r.right > innerWidth;   // 字比按钮宽、按钮把外框撑破
    })();
    if (cut || wrapped || burst) bad.push((el.className || el.tagName) + ': ' + el.textContent.trim().slice(0, 40));
  }
  return bad;
}"""


@needs_pw
def test_ui_english_flow_and_switch(home, imap, smtp, monkeypatch):
    monkeypatch.delenv("ZHIKE_LANG")
    from test_ui_e2e import FWD, fill_servers, shot
    from zhike import devserver
    from zhike.fakeservers import free_port
    imap.deliver(make_mail("Fwd: 订单确认 #SM-1001", FWD, frm="Colleague A <a@ourco.example>"))
    api = Api()
    assert api.store.settings["excel_path"].endswith("Zhike.xlsx")         # 英文：默认文件名 Zhike.xlsx
    api.store.settings["excel_path"] = str(Path(home) / "out" / "Zhike.xlsx")
    port = free_port()
    srv = devserver.serve(port, api)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    errors, over = [], []
    with pw.sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1180, "height": 760}, locale="en-US")
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
        pg.goto(f"http://127.0.0.1:{port}/?dev")
        pg.wait_for_selector(".wl")
        assert pg.evaluate("document.documentElement.lang") == "en" and pg.title() == "Zhike"
        assert pg.inner_text(".wl h1") == "Connect your inbox."
        over += pg.evaluate(OVERFLOW_JS)
        shot(pg, "en-welcome")
        pg.click('[data-act="try-demo"]')
        for v in ("inbox", "rules", "table", "drafts", "log", "settings"):
            pg.click(f'.side [data-nav="{v}"]')
            pg.wait_for_timeout(250)
            over += pg.evaluate(OVERFLOW_JS)
        pg.click('.side [data-nav="inbox"]')
        pg.click('[data-act="to-welcome"]')
        pg.fill("#wform [name=email]", "me@outlook.com")
        pg.wait_for_function("document.querySelector('#wform .ahelp').textContent.includes('Outlook coming soon')")
        pg.fill("#wform [name=email]", imap.user)
        pg.fill("#wform [name=pw]", "wrong")
        pg.wait_for_timeout(500)
        if pg.is_hidden("#wform [name=imaphost]"):
            pg.click('#wform [data-act="adv"]')
        fill_servers(pg, imap, smtp)
        pg.click('#wform [data-act="connect"]')
        pg.wait_for_selector("#wform .pw-err:not([hidden])")
        assert "Wrong password" in pg.inner_text("#wform .pw-err")
        pg.fill("#wform [name=pw]", imap.password)
        pg.press("#wform [name=pw]", "Enter")
        pg.wait_for_selector(".rec")
        assert pg.inner_text(".bar h1") == "1 rule, drafted for you"
        assert "Starts with Windows" in pg.inner_text(".note")
        over += pg.evaluate(OVERFLOW_JS)
        shot(pg, "en-recs")
        pg.fill(".rec .tag-in", "boss@test.local")
        pg.press(".rec .tag-in", "Enter")
        pg.click('[data-act="accept"]')
        pg.wait_for_selector('.toast:has-text("Accepted 1 rule")')
        over += pg.evaluate(OVERFLOW_JS)
        rule = api.boot()["rules"][0]
        assert rule["name"] == "Orders" and [f["name"] for f in rule["fields"] if not f.get("builtin")] == ["Order #", "Order date", "Amount"]
        imap.deliver(make_mail("Fwd: 订单确认 #SM-1002", FWD.replace("1001", "1002"), frm="Colleague B <b@ourco.example>"))
        pg.click('[data-act="run-now"]')
        pg.wait_for_selector('.li:has-text("SM-1002")')
        pg.click('.side [data-nav="table"]')
        pg.wait_for_selector("table td")
        assert pg.inner_text("table th >> nth=2") == "Order #"
        over += pg.evaluate(OVERFLOW_JS)
        hdr = [c.value for c in load_workbook(api.store.settings["excel_path"])["Orders"][1]]
        assert hdr == ["Received", "From", "Order #", "Order date", "Amount"]
        assert api.store.settings["excel_path"].endswith("Zhike.xlsx")
        import email as _em
        assert "---------- Forwarded message ----------" in _em.message_from_bytes(smtp.sent[-1][2], policy=_em.policy.default).get_body().get_content()
        # 设置里切中文：整个界面换、记进 config.json；再切回来
        pg.click('.side [data-nav="settings"]')
        pg.wait_for_selector(".seg.lang")
        over += pg.evaluate(OVERFLOW_JS)
        shot(pg, "en-settings")
        pg.click('.seg.lang [data-lang="zh"]')
        pg.wait_for_selector('.bar h1:has-text("设置")')
        assert pg.evaluate("document.documentElement.lang") == "zh-CN" and pg.title() == "知客僧"
        assert json.loads((Path(home) / "home" / "config.json").read_text("utf-8"))["settings"]["lang"] == "zh"
        assert api.boot()["rules"][0]["name"] == "Orders"            # 已经收下的规则名不动
        pg.reload()
        pg.wait_for_selector('.nav-i:has-text("收件")')                # 下次打开直接是上次选的
        pg.click('.side [data-nav="settings"]')
        pg.click('.seg.lang [data-lang="en"]')
        pg.wait_for_selector('.bar h1:has-text("Settings")')
        b.close()
    srv.shutdown()
    api.engine.stop()
    assert not errors, errors
    assert not over, sorted(set(over))


@needs_pw
def test_welcome_language_switch(home, monkeypatch):
    """第一次打开那屏（还没连邮箱、没有侧栏）右上角就能切中文。"""
    monkeypatch.delenv("ZHIKE_LANG")
    from zhike import devserver
    from zhike.fakeservers import free_port
    api = Api()
    port = free_port()
    srv = devserver.serve(port, api)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    errors = []
    with pw.sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1180, "height": 760}, locale="zh-CN")
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://127.0.0.1:{port}/?dev")
        pg.wait_for_selector(".wl")
        assert pg.inner_text(".wl h1") == "Connect your inbox."        # 不跟浏览器语言走：默认英文
        pg.click('.welcome .seg.lang [data-lang="zh"]')
        pg.wait_for_selector('.wl h1:has-text("连上邮箱")')
        assert api.store.lang == "zh"
        b.close()
    srv.shutdown()
    api.engine.stop()
    assert not errors, errors
