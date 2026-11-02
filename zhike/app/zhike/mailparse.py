"""把原始邮件（bytes）解析成知客僧要用的样子：发件人、主题、正文纯文本、附件名。"""
from __future__ import annotations

import email
import email.policy
import hashlib
import html
import re
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from email.utils import parseaddr, parsedate_to_datetime, getaddresses


@dataclass
class Mail:
    uid: int
    message_id: str
    from_name: str
    from_addr: str
    to: list
    subject: str
    date: str            # ISO 8601，本地时区无关，带偏移
    text: str            # 正文纯文本（HTML 已转成文字），抽字段就在这上面抽
    attachments: list = field(default_factory=list)   # 附件文件名
    references: str = ""
    zhike_mark: str = ""  # 我们自己转发/起草出去的信会带 X-Zhike 头，见到就跳过，防止绕圈
    raw: bytes = b""

    def key(self) -> str:
        return self.message_id or hashlib.sha1(self.raw).hexdigest()

    def to_dict(self, with_raw=False) -> dict:
        d = asdict(self)
        d.pop("raw")
        if with_raw:
            d["raw"] = self.raw.decode("utf-8", "replace")
        return d


_BLOCK_TAGS = re.compile(r"(?is)<\s*(br|/p|/div|/tr|/h\d|/li|/table)\b[^>]*>")
_CELL_TAGS = re.compile(r"(?is)<\s*/t[dh]\s*>")
_DROP = re.compile(r"(?is)<(script|style|head)\b.*?</\1\s*>")
_TAG = re.compile(r"(?s)<[^>]+>")


def html_to_text(s: str) -> str:
    s = _DROP.sub("", s)
    s = _CELL_TAGS.sub("  ", s)
    s = _BLOCK_TAGS.sub("\n", s)
    s = _TAG.sub("", s)
    s = html.unescape(s).replace("\xa0", " ")
    return normalize_text(s)


def normalize_text(s: str) -> str:
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    lines = [ln.rstrip() for ln in s.split("\n")]
    out, blank = [], 0
    for ln in lines:
        if ln.strip():
            blank = 0
            out.append(ln)
        else:
            blank += 1
            if blank == 1 and out:
                out.append("")
    return "\n".join(out).strip("\n")


def _decode_part(part) -> str:
    try:
        return part.get_content()
    except Exception:
        payload = part.get_payload(decode=True) or b""
        for cs in (part.get_content_charset(), "utf-8", "gb18030", "latin-1"):
            if not cs:
                continue
            try:
                return payload.decode(cs)
            except Exception:
                continue
        return payload.decode("utf-8", "replace")


def parse(raw: bytes, uid: int = 0) -> Mail:
    msg = email.message_from_bytes(raw, policy=email.policy.default)
    name, addr = parseaddr(str(msg.get("From", "")))
    to = [a for _, a in getaddresses([str(v) for v in msg.get_all("To", [])]) if a]
    try:
        dt = parsedate_to_datetime(str(msg.get("Date")))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    except Exception:
        dt = datetime.now(timezone.utc)
    plain, htm, atts = [], [], []
    for part in msg.walk():
        if part.is_multipart():
            continue
        fn = part.get_filename()
        disp = (part.get_content_disposition() or "").lower()
        if fn or disp == "attachment":
            atts.append(fn or "未命名附件")
            continue
        ct = part.get_content_type()
        if ct == "text/plain":
            plain.append(_decode_part(part))
        elif ct == "text/html":
            htm.append(_decode_part(part))
    if plain and any(p.strip() for p in plain):
        text = normalize_text("\n".join(plain))
    elif htm:
        text = html_to_text("\n".join(htm))
    else:
        text = ""
    return Mail(
        uid=uid,
        message_id=str(msg.get("Message-ID", "")).strip(),
        from_name=name,
        from_addr=addr.lower(),
        to=to,
        subject=str(msg.get("Subject", "")).strip(),
        date=dt.isoformat(),
        text=text,
        attachments=atts,
        references=(str(msg.get("References", "")) + " " + str(msg.get("Message-ID", ""))).strip(),
        zhike_mark=str(msg.get("X-Zhike", "")),
        raw=raw,
    )
