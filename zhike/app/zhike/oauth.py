"""微软登录（Outlook / Hotmail / Microsoft 365）：OAuth2 授权码 + PKCE，回调落在本机 localhost。

为什么要它：微软已经关掉了 Outlook/Hotmail 的「应用密码」收信，公司的 Microsoft 365 也大多关了，
只能走微软登录拿令牌，再用 XOAUTH2 登 IMAP / SMTP。

流程（全在用户自己电脑上，令牌只存本机凭据管理器）：
  1. 本机开一个只听 127.0.0.1 的临时端口，打开浏览器去微软登录页；
  2. 用户在微软自己的页面上登录、点「接受」；微软把授权码送回 http://localhost:端口；
  3. 拿授权码换令牌（access 1 小时，refresh 长期），refresh 存进凭据管理器，用时自动续。

需要一个「微软开发者应用」的 ID（公开客户端，不需要密钥）。注册步骤见 docs/微软登录注册.md；
没填之前 CLIENT_ID 为空，界面上显示「Outlook 即将支持」。
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets as _rand
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

# Song 注册好微软应用后，把「应用程序(客户端) ID」填在这里（或用环境变量 ZHIKE_MS_CLIENT_ID）。
CLIENT_ID = ""
AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0"
SCOPES = "offline_access https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send"
MS_DOMAINS = {"outlook.com", "hotmail.com", "live.com", "msn.com", "outlook.sg", "hotmail.co.uk", "live.cn"}


class OAuthError(Exception):
    def __init__(self, code, detail=""):
        super().__init__(code)
        self.code, self.detail = code, detail     # cancelled / timeout / denied / net / expired / other


def client_id() -> str:
    return os.environ.get("ZHIKE_MS_CLIENT_ID") or CLIENT_ID


def available() -> bool:
    return bool(client_id())


def authority() -> str:
    return os.environ.get("ZHIKE_MS_AUTHORITY") or AUTHORITY   # 测试时指向本机假服务器


def xoauth2(user: str, token: str) -> str:
    return f"user={user}\x01auth=Bearer {token}\x01\x01"


def _post(url, data: dict, timeout=20) -> dict:
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            info = json.loads(e.read().decode())
        except Exception:
            info = {}
        err = info.get("error", "")
        if err in ("invalid_grant", "interaction_required", "consent_required"):
            raise OAuthError("expired", info.get("error_description", "")[:300])
        raise OAuthError("other", f"HTTP {e.code} {err} {info.get('error_description', '')[:300]}")
    except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, OSError) as e:
        raise OAuthError("net", str(e))


def _tokens(resp: dict, old_refresh: str = "") -> dict:
    if "access_token" not in resp:
        raise OAuthError("other", json.dumps(resp)[:300])
    return {"access_token": resp["access_token"],
            "refresh_token": resp.get("refresh_token") or old_refresh,
            "expires_at": time.time() + int(resp.get("expires_in", 3600)) - 120}


def login(email: str, open_browser=webbrowser.open, timeout: float = 300, lang: str = "zh") -> dict:
    """打开浏览器让用户在微软页面登录，等回调，换回令牌。"""
    if not available():
        raise OAuthError("unavailable")
    verifier = base64.urlsafe_b64encode(_rand.token_bytes(32)).rstrip(b"=").decode()
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = _rand.token_urlsafe(16)
    got = {}
    done = threading.Event()

    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if q.get("state", [""])[0] != state:
                self.send_response(400)
                self.end_headers()
                return
            got.update({k: v[0] for k, v in q.items()})
            from .text import T
            page = (f"<!doctype html><html lang={T('html_lang', lang)}><meta charset=utf-8><title>{T('app', lang)}</title>"
                    "<body style='font:15px -apple-system,Segoe UI,sans-serif;display:grid;place-items:center;height:90vh'>"
                    "<div style='text-align:center'><h2>" + T("ms_done_ok" if "code" in got else "ms_done_fail", lang) +
                    "</h2><p>" + T("ms_done_s", lang) + "</p></div>").encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(page)))
            self.end_headers()
            self.wfile.write(page)
            done.set()

        def log_message(self, *a):
            pass

    srv = HTTPServer(("127.0.0.1", 0), H)
    port = srv.server_address[1]
    redirect = f"http://localhost:{port}"
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        url = authority() + "/authorize?" + urllib.parse.urlencode({
            "client_id": client_id(), "response_type": "code", "redirect_uri": redirect,
            "response_mode": "query", "scope": SCOPES, "state": state, "login_hint": email,
            "code_challenge": challenge, "code_challenge_method": "S256", "prompt": "select_account"})
        open_browser(url)
        if not done.wait(timeout):
            raise OAuthError("timeout")
    finally:
        srv.shutdown()
        srv.server_close()
    if "code" not in got:
        err = got.get("error", "")
        raise OAuthError("denied" if err in ("access_denied", "consent_required") else "other",
                         (err + " " + got.get("error_description", ""))[:300])
    resp = _post(authority() + "/token", {
        "client_id": client_id(), "grant_type": "authorization_code", "code": got["code"],
        "redirect_uri": redirect, "code_verifier": verifier, "scope": SCOPES})
    return _tokens(resp)


def refresh(refresh_token: str) -> dict:
    resp = _post(authority() + "/token", {
        "client_id": client_id(), "grant_type": "refresh_token", "refresh_token": refresh_token, "scope": SCOPES})
    return _tokens(resp, refresh_token)


class TokenStore:
    """令牌存在 Secrets（凭据管理器）里：ms:<账号 id> = JSON。"""

    def __init__(self, secrets):
        self.secrets = secrets
        self.lock = threading.Lock()

    def save(self, acct_id, tok: dict):
        self.secrets.set(f"ms:{acct_id}", json.dumps(tok))

    def access_token(self, acct_id) -> str:
        with self.lock:
            raw = self.secrets.get(f"ms:{acct_id}")
            if not raw:
                raise OAuthError("expired", "no token")
            tok = json.loads(raw)
            if tok.get("access_token") and tok.get("expires_at", 0) > time.time():
                return tok["access_token"]
            tok = refresh(tok["refresh_token"])
            self.save(acct_id, tok)
            return tok["access_token"]
