import json
import sys
import threading
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from zhike.fakeservers import FakeImap, FakeSmtp, account_for  # noqa: E402
from zhike.engine import Engine  # noqa: E402
from zhike.secrets import Secrets  # noqa: E402
from zhike.store import Store  # noqa: E402


@pytest.fixture
def imap():
    s = FakeImap().start()
    yield s
    s.stop()


@pytest.fixture
def smtp():
    s = FakeSmtp().start()
    yield s
    s.stop()


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("ZHIKE_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("ZHIKE_NO_KEYRING", "1")
    return tmp_path


class FakeGemini:
    def __init__(self):
        self.status, self.body, self.calls = 200, None, []
        owner = self

        class H(BaseHTTPRequestHandler):
            def do_POST(self):
                n = int(self.headers.get("Content-Length", 0))
                owner.calls.append((self.path, self.headers.get("x-goog-api-key"), json.loads(self.rfile.read(n))))
                body = owner.body or {"candidates": [{"content": {"parts": [{"text": "AI 写的回复：报价今天发您。"}]}}]}
                if owner.status == 429:
                    body = {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "Quota exceeded"}}
                elif owner.status == 400:
                    body = {"error": {"code": 400, "status": "INVALID_ARGUMENT", "message": "API key not valid. API_KEY_INVALID"}}
                data = json.dumps(body).encode()
                self.send_response(owner.status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *a):
                pass

        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.base = f"http://127.0.0.1:{self.srv.server_address[1]}/v1beta"
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def stop(self):
        self.srv.shutdown()
        self.srv.server_close()


@pytest.fixture
def gemini():
    g = FakeGemini()
    yield g
    g.stop()


def make_mail(subject, body, frm="山门商贸 <orders@shanmen-shop.example>", atts=(), headers=None, html=None):
    m = EmailMessage()
    m["From"] = frm
    m["To"] = "me@test.local"
    m["Subject"] = subject
    m["Date"] = formatdate(localtime=True)
    m["Message-ID"] = make_msgid(domain="sender.example")
    for k, v in (headers or {}).items():
        m[k] = v
    m.set_content(body)
    if html:
        m.add_alternative(html, subtype="html")
    for name, data in atts:
        m.add_attachment(data, maintype="application", subtype="pdf", filename=name)
    return m.as_bytes()


def order_mail(no, amount, who="王小明", phone="138-0013-8000"):
    return make_mail(f"订单确认 #{no}",
                     f"您好，您的订单已确认。\n\n订单号：{no}\n下单时间：2026-11-01 09:30\n实付金额：¥{amount}\n"
                     f"联系人：{who}  电话：{phone}\n", atts=[(f"发票_{no}.pdf", b"%PDF-1.4 x")])


@pytest.fixture
def env(home, imap, smtp, gemini):
    """一个装好账号和示例规则的引擎。"""
    from zhike import samples
    store = Store()
    sec = Secrets(store.root)
    store.settings["excel_path"] = str(home / "out" / "知客僧.xlsx")
    acct = account_for(imap, smtp)
    store.accounts.append(acct)
    sec.set(f"pw:{acct['id']}", imap.password)
    rules = samples.demo_rules()
    rules[0]["forward"]["to"] = ["boss@test.local"]
    rules[2]["conditions"]["from"] = []
    store.config.data["rules"] = rules
    store.config.save()
    eng = Engine(store, sec, ai_base=gemini.base)
    eng.connect_new(acct)
    return {"store": store, "sec": sec, "acct": acct, "eng": eng, "imap": imap, "smtp": smtp, "gemini": gemini, "home": home}
