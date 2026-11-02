"""本地假邮箱：一个最小的 IMAP4rev1 服务器 + 一个 SMTP 服务器，只监听 127.0.0.1。

测试和 exe 冒烟测试用，不连任何真邮箱。能模拟：密码错、断网（直接拒连 / 半路掐线）、
邮箱满（APPEND 回 OVERQUOTA，SMTP 回 552）。
"""
from __future__ import annotations

import re
import socket
import socketserver
import threading
import time


class Box:
    def __init__(self, name, flags=""):
        self.name, self.flags, self.msgs, self.next_uid = name, flags, [], 1

    def add(self, raw: bytes, flags=()):
        self.msgs.append({"uid": self.next_uid, "raw": raw, "flags": set(flags)})
        self.next_uid += 1
        return self.next_uid - 1


class FakeImap:
    def __init__(self, user="me@test.local", password="app-pass", drafts_name="Drafts", special_use=True):
        self.user, self.password = user, password
        self.boxes = {"INBOX": Box("INBOX")}
        self.drafts_name = drafts_name
        self.boxes[drafts_name] = Box(drafts_name, "\\Drafts" if special_use else "")
        self.uidvalidity = 1700000001
        self.quota_full = False
        self.cut_after_login = False
        self.logins = 0
        self.lock = threading.RLock()
        self.srv = None

    # ---- 控制 ----
    def deliver(self, raw: bytes):
        with self.lock:
            return self.boxes["INBOX"].add(raw)

    @property
    def drafts(self):
        return self.boxes[self.drafts_name].msgs

    def start(self):
        owner = self

        class H(socketserver.StreamRequestHandler):
            def handle(self):
                owner._session(self)

        class S(socketserver.ThreadingTCPServer):
            allow_reuse_address = True
            daemon_threads = True

        self.srv = S(("127.0.0.1", 0), H)
        self.port = self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        return self

    def stop(self):
        if self.srv:
            self.srv.shutdown()
            self.srv.server_close()
            self.srv = None

    # ---- 协议 ----
    def _session(self, h):
        w = lambda s: (h.wfile.write(s if isinstance(s, bytes) else s.encode()), h.wfile.flush())
        w("* OK [CAPABILITY IMAP4rev1 ID UIDPLUS] fake ready\r\n")
        authed, selected = False, None
        while True:
            line = h.rfile.readline()
            if not line:
                return
            line = line.decode("utf-8", "replace").rstrip("\r\n")
            m = re.match(r"(\S+)\s+(\S+)\s*(.*)$", line)
            if not m:
                continue
            tag, cmd, rest = m.group(1), m.group(2).upper(), m.group(3)
            if cmd == "UID":
                sub, _, rest = rest.partition(" ")
                cmd = "UID " + sub.upper()
            with self.lock:
                if cmd == "CAPABILITY":
                    w("* CAPABILITY IMAP4rev1 ID UIDPLUS\r\n" + f"{tag} OK done\r\n")
                elif cmd == "ID":
                    w('* ID ("name" "fake")\r\n' + f"{tag} OK ID done\r\n")
                elif cmd == "NOOP":
                    w(f"{tag} OK noop\r\n")
                elif cmd == "LOGOUT":
                    w("* BYE bye\r\n" + f"{tag} OK bye\r\n")
                    return
                elif cmd == "LOGIN":
                    args = _args(rest)
                    if len(args) == 2 and args[0] == self.user and args[1] == self.password:
                        authed = True
                        self.logins += 1
                        w(f"{tag} OK LOGIN completed\r\n")
                        if self.cut_after_login:
                            h.connection.shutdown(socket.SHUT_RDWR)
                            return
                    else:
                        w(f"{tag} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n")
                elif not authed:
                    w(f"{tag} BAD login first\r\n")
                elif cmd == "LIST":
                    out = ""
                    for b in self.boxes.values():
                        out += f'* LIST ({b.flags}) "/" "{b.name}"\r\n'
                    w(out + f"{tag} OK LIST done\r\n")
                elif cmd in ("SELECT", "EXAMINE"):
                    name = _args(rest)[0]
                    b = self.boxes.get("INBOX" if name.upper() == "INBOX" else name)
                    if not b:
                        w(f"{tag} NO no such mailbox\r\n")
                        continue
                    selected = b
                    w(f"* {len(b.msgs)} EXISTS\r\n* 0 RECENT\r\n* OK [UIDVALIDITY {self.uidvalidity}] UIDs valid\r\n"
                      f"* OK [UIDNEXT {b.next_uid}] next\r\n{tag} OK [READ-ONLY] done\r\n")
                elif cmd == "UID SEARCH":
                    b = selected
                    crit = rest.strip()
                    if crit.upper().startswith("UID "):
                        lo, _, hi = crit[4:].partition(":")
                        lo = int(lo)
                        mx = b.msgs[-1]["uid"] if b.msgs else 0
                        hi = mx if hi in ("*", "") else int(hi)
                        a, z = min(lo, hi), max(lo, hi)
                        hits = [x["uid"] for x in b.msgs if a <= x["uid"] <= z]
                        if not hits and b.msgs and lo > mx:
                            hits = [mx]   # RFC 3501：N:* 里 * 是最大的 UID，所以总会带回最后一封
                    else:
                        hits = [x["uid"] for x in b.msgs]
                    w("* SEARCH" + "".join(f" {u}" for u in hits) + f"\r\n{tag} OK SEARCH done\r\n")
                elif cmd == "UID FETCH":
                    seq, _, _ = rest.partition(" ")
                    want = set()
                    for part in seq.split(","):
                        if ":" in part:
                            a, z = part.split(":")
                            want.update(range(int(a), int(z) + 1))
                        else:
                            want.add(int(part))
                    b = selected
                    for i, x in enumerate(b.msgs, 1):
                        if x["uid"] in want:
                            w(f"* {i} FETCH (UID {x['uid']} BODY[] {{{len(x['raw'])}}}\r\n".encode() + x["raw"] + b")\r\n")
                    w(f"{tag} OK FETCH done\r\n")
                elif cmd == "APPEND":
                    lm = re.search(r"\{(\d+)\}$", rest)
                    if not lm:
                        w(f"{tag} BAD no literal\r\n")
                        continue
                    n = int(lm.group(1))
                    name = _args(rest[:lm.start()])[0]
                    w("+ go ahead\r\n")
                    data = h.rfile.read(n)
                    h.rfile.readline()
                    if self.quota_full:
                        w(f"{tag} NO [OVERQUOTA] Mailbox is full\r\n")
                        continue
                    b = self.boxes.get(name)
                    if not b:
                        w(f"{tag} NO [TRYCREATE] no such mailbox\r\n")
                        continue
                    uid = b.add(data, ["\\Draft"])
                    w(f"{tag} OK [APPENDUID {self.uidvalidity} {uid}] APPEND done\r\n")
                elif cmd in ("CLOSE", "CHECK"):
                    w(f"{tag} OK done\r\n")
                else:
                    w(f"{tag} BAD unknown {cmd}\r\n")


def _args(s: str) -> list:
    out = []
    for m in re.finditer(r'"((?:[^"\\]|\\.)*)"|(\S+)', s):
        out.append(m.group(1).replace('\\"', '"').replace("\\\\", "\\") if m.group(1) is not None else m.group(2))
    return out


class FakeSmtp:
    """最小 SMTP：EHLO / AUTH PLAIN / MAIL / RCPT / DATA / QUIT。"""

    def __init__(self, user="me@test.local", password="app-pass"):
        self.user, self.password = user, password
        self.sent = []          # [(mail_from, rcpts, data)]
        self.quota_full = False
        self.srv = None

    def start(self):
        owner = self

        class H(socketserver.StreamRequestHandler):
            def handle(self):
                owner._session(self)

        class S(socketserver.ThreadingTCPServer):
            allow_reuse_address = True
            daemon_threads = True

        self.srv = S(("127.0.0.1", 0), H)
        self.port = self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        return self

    def stop(self):
        if self.srv:
            self.srv.shutdown()
            self.srv.server_close()
            self.srv = None

    def _session(self, h):
        import base64
        w = lambda s: (h.wfile.write(s.encode()), h.wfile.flush())
        w("220 fake smtp ready\r\n")
        authed, frm, rcpts = False, None, []
        while True:
            line = h.rfile.readline()
            if not line:
                return
            cmd = line.decode("utf-8", "replace").strip()
            up = cmd.upper()
            if up.startswith(("EHLO", "HELO")):
                w("250-fake\r\n250-8BITMIME\r\n250-SMTPUTF8\r\n250-AUTH PLAIN\r\n250 OK\r\n")
            elif up.startswith("AUTH PLAIN"):
                parts = cmd.split()
                if len(parts) < 3:
                    w("334 \r\n")
                    b64 = h.rfile.readline().decode().strip()
                else:
                    b64 = parts[2]
                try:
                    _, u, pw = base64.b64decode(b64).decode().split("\0")
                except Exception:
                    u = pw = ""
                if u == self.user and pw == self.password:
                    authed = True
                    w("235 2.7.0 Authentication successful\r\n")
                else:
                    w("535 5.7.8 Authentication credentials invalid\r\n")
            elif up.startswith("MAIL FROM"):
                if not authed:
                    w("530 5.7.0 Authentication required\r\n")
                    continue
                frm, rcpts = cmd.split(":", 1)[1].strip().split()[0].strip("<>"), []
                w("250 OK\r\n")
            elif up.startswith("RCPT TO"):
                rcpts.append(cmd.split(":", 1)[1].strip().split()[0].strip("<>"))
                w("250 OK\r\n")
            elif up == "DATA":
                w("354 go\r\n")
                buf = []
                while True:
                    ln = h.rfile.readline()
                    if not ln or ln in (b".\r\n", b".\n"):
                        break
                    buf.append(ln[1:] if ln.startswith(b"..") else ln)
                if self.quota_full:
                    w("552 5.2.2 Mailbox full, quota exceeded\r\n")
                else:
                    self.sent.append((frm, rcpts, b"".join(buf)))
                    w("250 OK queued\r\n")
            elif up == "QUIT":
                w("221 bye\r\n")
                return
            elif up in ("RSET", "NOOP"):
                w("250 OK\r\n")
            else:
                w("502 not implemented\r\n")


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def account_for(imap: FakeImap, smtp: FakeSmtp, acct_id="t1") -> dict:
    return {"id": acct_id, "email": imap.user, "username": imap.user, "provider": "custom",
            "imap_host": "127.0.0.1", "imap_port": imap.port, "imap_security": "plain",
            "smtp_host": "127.0.0.1", "smtp_port": smtp.port, "smtp_security": "plain", "enabled": True}
