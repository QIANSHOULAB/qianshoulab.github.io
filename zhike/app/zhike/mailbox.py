"""连邮箱：IMAP 收信、存草稿，SMTP 转发。所有失败都翻译成四种：断网、密码错、邮箱满、其它。"""
from __future__ import annotations

import imaplib
import re
import smtplib
import socket
import ssl
import time
from email.message import EmailMessage
from email.utils import formatdate, make_msgid, parseaddr

from . import VERSION
from .mailparse import parse


class MailError(Exception):
    code = "mail_error"

    def __init__(self, msg="", detail=""):
        super().__init__(msg or self.code)
        self.detail = detail or msg


class NetError(MailError):
    code = "net"


class AuthError(MailError):
    code = "auth"


class QuotaError(MailError):
    code = "quota"


# 各家邮箱的服务器。密码一律是「应用专用密码 / 授权码」，不是网页登录密码。
PROVIDERS = {
    "gmail": {"imap": ("imap.gmail.com", 993, "ssl"), "smtp": ("smtp.gmail.com", 465, "ssl"), "domains": ["gmail.com", "googlemail.com"]},
    "outlook": {"imap": ("outlook.office365.com", 993, "ssl"), "smtp": ("smtp.office365.com", 587, "starttls"),
                "domains": ["outlook.com", "hotmail.com", "live.com", "msn.com"]},
    "qq": {"imap": ("imap.qq.com", 993, "ssl"), "smtp": ("smtp.qq.com", 465, "ssl"), "domains": ["qq.com", "foxmail.com"]},
    "exmail": {"imap": ("imap.exmail.qq.com", 993, "ssl"), "smtp": ("smtp.exmail.qq.com", 465, "ssl"), "domains": []},
    "163": {"imap": ("imap.163.com", 993, "ssl"), "smtp": ("smtp.163.com", 465, "ssl"), "domains": ["163.com"]},
    "126": {"imap": ("imap.126.com", 993, "ssl"), "smtp": ("smtp.126.com", 465, "ssl"), "domains": ["126.com"]},
    "yahoo": {"imap": ("imap.mail.yahoo.com", 993, "ssl"), "smtp": ("smtp.mail.yahoo.com", 465, "ssl"), "domains": ["yahoo.com"]},
    "icloud": {"imap": ("imap.mail.me.com", 993, "ssl"), "smtp": ("smtp.mail.me.com", 587, "starttls"),
               "domains": ["icloud.com", "me.com", "mac.com"]},
}


def guess_provider(addr: str) -> str:
    dom = addr.rsplit("@", 1)[-1].lower().strip()
    for k, p in PROVIDERS.items():
        if dom in p["domains"]:
            return k
    return "custom"


def account_from(email_addr: str, provider: str | None = None, **over) -> dict:
    provider = provider or guess_provider(email_addr)
    p = PROVIDERS.get(provider)
    a = {"email": email_addr.strip(), "username": email_addr.strip(), "provider": provider}
    if p:
        a.update(imap_host=p["imap"][0], imap_port=p["imap"][1], imap_security=p["imap"][2],
                 smtp_host=p["smtp"][0], smtp_port=p["smtp"][1], smtp_security=p["smtp"][2])
    a.update({k: v for k, v in over.items() if v not in (None, "")})
    return a


# ---------- IMAP 修改版 UTF-7（QQ 邮箱的「草稿箱」就是这么编码的） ----------
def imap_utf7_decode(s: str) -> str:
    out, i = [], 0
    while i < len(s):
        c = s[i]
        if c == "&":
            j = s.find("-", i)
            if j == i + 1:
                out.append("&")
            else:
                b64 = s[i + 1:j].replace(",", "/")
                b64 += "=" * (-len(b64) % 4)
                import base64
                out.append(base64.b64decode(b64).decode("utf-16-be"))
            i = j + 1
        else:
            out.append(c)
            i += 1
    return "".join(out)


def imap_utf7_encode(s: str) -> str:
    import base64
    out, buf = [], []

    def flush():
        if buf:
            b = base64.b64encode("".join(buf).encode("utf-16-be")).decode().rstrip("=").replace("/", ",")
            out.append("&" + b + "-")
            buf.clear()

    for ch in s:
        if 0x20 <= ord(ch) <= 0x7e:
            flush()
            out.append("&-" if ch == "&" else ch)
        else:
            buf.append(ch)
    flush()
    return "".join(out)


_LIST_RE = re.compile(r'\((?P<flags>[^)]*)\)\s+(?P<delim>"[^"]*"|NIL)\s+(?P<name>.+)$')
_DRAFT_NAMES = ["drafts", "draft", "草稿箱", "草稿", "[gmail]/drafts", "[google mail]/drafts", "entwürfe", "brouillons"]
_QUOTA_RX = re.compile(r"OVERQUOTA|QUOTA|full|exceed|storage|满|空间不足", re.I)
_AUTH_RX = re.compile(r"AUTHENTICATIONFAILED|AUTHORIZATIONFAILED|invalid|incorrect|failed|password|credential|LOGIN|密码|授权码", re.I)


def _neterr(e):
    return NetError(f"{type(e).__name__}: {e}")


IMAP_TIMEOUT = 30
imaplib.Commands.setdefault("ID", ("NONAUTH", "AUTH", "SELECTED"))


class Imap:
    def __init__(self, acct: dict, password: str, timeout: float = IMAP_TIMEOUT):
        self.acct, self.password, self.timeout = acct, password, timeout
        self.c = None

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, *a):
        self.close()

    def connect(self):
        host, port, sec = self.acct["imap_host"], int(self.acct["imap_port"]), self.acct.get("imap_security", "ssl")
        try:
            if sec == "ssl":
                self.c = imaplib.IMAP4_SSL(host, port, ssl_context=ssl.create_default_context(), timeout=self.timeout)
            else:
                self.c = imaplib.IMAP4(host, port, timeout=self.timeout)
                if sec == "starttls":
                    self.c.starttls(ssl.create_default_context())
        except (OSError, imaplib.IMAP4.abort, ssl.SSLError) as e:
            raise _neterr(e)
        except imaplib.IMAP4.error as e:
            raise NetError(str(e))
        try:
            # 163/126 不发 ID 会报「Unsafe Login」
            if "ID" in self.c.capabilities:
                self.c._simple_command("ID", f'("name" "zhike" "version" "{VERSION}" "vendor" "QIANSHOU LAB")')
        except Exception:
            pass
        try:
            self.c.login(self.acct.get("username") or self.acct["email"], self.password)
        except imaplib.IMAP4.abort as e:
            raise _neterr(e)
        except imaplib.IMAP4.error as e:
            raise AuthError(str(e))
        except OSError as e:
            raise _neterr(e)
        return self

    def close(self):
        if self.c is not None:
            try:
                self.c.logout()
            except Exception:
                pass
            self.c = None

    def _call(self, fn, *a):
        try:
            typ, data = fn(*a)
        except (OSError, imaplib.IMAP4.abort) as e:
            raise _neterr(e)
        except imaplib.IMAP4.error as e:
            msg = str(e)
            if _QUOTA_RX.search(msg):
                raise QuotaError(msg)
            raise MailError(msg)
        if typ != "OK":
            msg = " ".join(x.decode("utf-8", "replace") if isinstance(x, bytes) else str(x) for x in data if x)
            if _QUOTA_RX.search(msg):
                raise QuotaError(msg)
            raise MailError(msg)
        return data

    def select_inbox(self):
        data = self._call(self.c.select, "INBOX", True)
        uv = self.c.untagged_responses.get("UIDVALIDITY", [b"0"])[-1]
        try:
            uidvalidity = int(uv)
        except (TypeError, ValueError):
            uidvalidity = 0
        return uidvalidity, int(data[0] or 0)

    def uids_after(self, last_uid: int) -> list:
        data = self._call(self.c.uid, "SEARCH", None, f"UID {last_uid + 1}:*")
        uids = [int(x) for x in (data[0] or b"").split()]
        return sorted(u for u in uids if u > last_uid)   # 「N:*」在没有新信时会把最后一封也带回来，要滤掉

    def all_uids(self) -> list:
        data = self._call(self.c.uid, "SEARCH", None, "ALL")
        return sorted(int(x) for x in (data[0] or b"").split())

    def fetch(self, uids: list) -> list:
        mails = []
        for i in range(0, len(uids), 20):
            chunk = ",".join(str(u) for u in uids[i:i + 20])
            data = self._call(self.c.uid, "FETCH", chunk, "(UID BODY.PEEK[])")
            for item in data:
                if isinstance(item, tuple) and len(item) == 2:
                    m = re.search(rb"UID (\d+)", item[0])
                    uid = int(m.group(1)) if m else 0
                    mails.append(parse(item[1], uid))
        mails.sort(key=lambda m: m.uid)
        return mails

    def drafts_folder(self) -> str:
        data = self._call(self.c.list)
        names = []
        for raw in data:
            if not raw:
                continue
            line = raw.decode("utf-8", "replace") if isinstance(raw, bytes) else str(raw)
            m = _LIST_RE.search(line)
            if not m:
                continue
            name = m.group("name").strip()
            if name.startswith('"') and name.endswith('"'):
                name = name[1:-1].replace('\\"', '"')
            if "\\drafts" in m.group("flags").lower():
                return name
            names.append(name)
        for want in _DRAFT_NAMES:
            for n in names:
                if imap_utf7_decode(n).lower() == want:
                    return n
        return ""

    def append_draft(self, msg: bytes) -> str:
        folder = self.drafts_folder()
        if not folder:
            raise MailError("no drafts folder")
        quoted = '"' + folder.replace('"', '\\"') + '"'
        self._call(self.c.append, quoted, "(\\Draft \\Seen)", imaplib.Time2Internaldate(time.time()), msg)
        return imap_utf7_decode(folder)


class Smtp:
    def __init__(self, acct: dict, password: str, timeout: float = 30):
        self.acct, self.password, self.timeout = acct, password, timeout

    def send(self, msg: EmailMessage):
        host, port, sec = self.acct["smtp_host"], int(self.acct["smtp_port"]), self.acct.get("smtp_security", "ssl")
        try:
            if sec == "ssl":
                s = smtplib.SMTP_SSL(host, port, timeout=self.timeout, context=ssl.create_default_context())
            else:
                s = smtplib.SMTP(host, port, timeout=self.timeout)
                if sec == "starttls":
                    s.starttls(context=ssl.create_default_context())
        except (OSError, smtplib.SMTPException) as e:
            raise _neterr(e)
        try:
            try:
                s.login(self.acct.get("username") or self.acct["email"], self.password)
            except smtplib.SMTPAuthenticationError as e:
                raise AuthError(str(e))
            except smtplib.SMTPNotSupportedError:
                pass
            try:
                s.send_message(msg)
            except smtplib.SMTPRecipientsRefused as e:
                codes = [c for c, _ in e.recipients.values()]
                if any(c in (452, 552) for c in codes):
                    raise QuotaError(str(e))
                raise MailError(str(e))
            except smtplib.SMTPResponseException as e:
                if e.smtp_code in (452, 552, 554) and _QUOTA_RX.search(str(e.smtp_error)):
                    raise QuotaError(str(e))
                raise MailError(str(e))
            except (OSError, smtplib.SMTPServerDisconnected) as e:
                raise _neterr(e)
        finally:
            try:
                s.quit()
            except Exception:
                pass


def test_account(acct: dict, password: str) -> dict:
    """「试一下」按钮：收信、发信两头都连一遍（发信只登录，不发任何信）。"""
    with Imap(acct, password, timeout=15) as im:
        _, count = im.select_inbox()
    host, port, sec = acct["smtp_host"], int(acct["smtp_port"]), acct.get("smtp_security", "ssl")
    try:
        s = (smtplib.SMTP_SSL(host, port, timeout=15, context=ssl.create_default_context()) if sec == "ssl"
             else smtplib.SMTP(host, port, timeout=15))
        if sec == "starttls":
            s.starttls(context=ssl.create_default_context())
    except (OSError, smtplib.SMTPException) as e:
        raise _neterr(e)
    try:
        s.login(acct.get("username") or acct["email"], password)
    except smtplib.SMTPAuthenticationError as e:
        raise AuthError(str(e))
    except smtplib.SMTPNotSupportedError:
        pass
    except (OSError, smtplib.SMTPServerDisconnected) as e:
        raise _neterr(e)
    finally:
        try:
            s.quit()
        except Exception:
            pass
    return {"count": count}


# ---------- 拼信 ----------
def _quote(text: str) -> str:
    return "\n".join("> " + ln for ln in text.splitlines())


def build_forward(mail, from_addr: str, to_addrs: list, note: str = "") -> EmailMessage:
    import email
    import email.policy
    orig = email.message_from_bytes(mail.raw, policy=email.policy.default)
    m = EmailMessage()
    m["From"] = from_addr
    m["To"] = ", ".join(to_addrs)
    subj = mail.subject
    m["Subject"] = subj if re.match(r"(?i)(fwd?|转发)[:：]", subj) else f"Fwd: {subj}"
    m["Date"] = formatdate(localtime=True)
    m["Message-ID"] = make_msgid(domain=from_addr.rsplit("@", 1)[-1] or "zhike.local")
    m["X-Zhike"] = "forwarded"
    if mail.from_addr:
        m["Reply-To"] = mail.from_addr
    head = [note.strip(), ""] if note.strip() else []
    head += ["---------- 转发的邮件 ----------",
             f"发件人：{mail.from_name} <{mail.from_addr}>".replace(" <", " <") if mail.from_name else f"发件人：{mail.from_addr}",
             f"日期：{mail.date}", f"主题：{mail.subject}", "", mail.text]
    m.set_content("\n".join(head))
    for part in orig.walk():
        if part.is_multipart():
            continue
        fn = part.get_filename()
        if fn or (part.get_content_disposition() or "") == "attachment":
            payload = part.get_payload(decode=True) or b""
            maintype, _, subtype = part.get_content_type().partition("/")
            m.add_attachment(payload, maintype=maintype, subtype=subtype or "octet-stream", filename=fn or "attachment")
    return m


def build_draft(mail, from_addr: str, body: str) -> bytes:
    m = EmailMessage()
    m["From"] = from_addr
    m["To"] = mail.from_addr
    subj = mail.subject
    m["Subject"] = subj if re.match(r"(?i)(re|回复)[:：]", subj) else f"Re: {subj}"
    m["Date"] = formatdate(localtime=True)
    m["Message-ID"] = make_msgid(domain=from_addr.rsplit("@", 1)[-1] or "zhike.local")
    if mail.message_id:
        m["In-Reply-To"] = mail.message_id
        m["References"] = mail.references or mail.message_id
    m["X-Zhike"] = "draft"
    m.set_content(body.rstrip() + "\n\n" + _quote(mail.text))
    return m.as_bytes()
