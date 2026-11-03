"""把原始邮件（bytes）解析成知客僧要用的样子：发件人、主题、正文纯文本、附件名。

两件额外的事：
- 转发信（同事转来的、转了好几层的）：认出「Forwarded message / Original Message / 转发的邮件 / 原始邮件」
  这些块，拿最里面那层的原发件人、原主题，规则按原信认。
- PDF 附件：把里面的文字抽出来接在正文后面（「—— 附件 xxx.pdf ——」），发票 PDF 里的金额、编号也能点选、能抽。
"""
from __future__ import annotations

import email
import email.policy
import hashlib
import html
import re
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from email.header import decode_header, make_header
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
    body: str = ""        # 只有正文（不含 PDF 抽出来的字），转发/起草引用用它
    orig_from: str = ""   # 转发信最里面那层的原发件人（不是转发信就空）
    orig_from_name: str = ""
    orig_subject: str = ""
    fwd_by: list = field(default_factory=list)   # 一路转过来的人

    @property
    def forwarded(self) -> bool:
        return bool(self.orig_from or self.orig_subject)

    def key(self) -> str:
        return self.message_id or hashlib.sha1(self.raw).hexdigest()

    def to_dict(self, with_raw=False) -> dict:
        d = asdict(self)
        d.pop("raw")
        d["forwarded"] = self.forwarded
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


def _hdr(v) -> str:
    """头部解码（RFC 2047 的 =?utf-8?...?=），坏了就原样。"""
    if v is None:
        return ""
    v = str(v)
    if "=?" not in v:
        return re.sub(r"\s*\r?\n\s+", " ", v)
    try:
        return str(make_header(decode_header(v)))
    except Exception:
        return v


def _decode_part(part) -> str:
    payload = part.get_payload(decode=True) or b""
    cs = (part.get_content_charset() or "").lower()
    if cs in ("gb2312", "gbk", "x-gbk", "cp936"):
        cs = "gb18030"          # 国产客户端常标 gb2312，实际用了 gbk 的字
    for c in (cs, "utf-8", "gb18030", "latin-1"):
        if not c:
            continue
        try:
            return payload.decode(c)
        except Exception:
            continue
    return payload.decode("utf-8", "replace")


# ---------- 转发信 ----------
_FWD_MARK = re.compile(
    r"(?im)^[ \t>]*(?:-{2,}[ \t]*(?:Forwarded message|Original Message|转发的邮件|原始邮件|转发邮件)[ \t]*-{2,}"
    r"|-{5,}[ \t]*(?:Forwarded|Original)[^\n]*|Begin forwarded message:?|[-—=]{3,}[ \t]*(?:原始邮件|转发邮件|Forwarded)[ \t]*[-—=]{3,})[ \t]*$")
_H_FROM = re.compile(r"(?i)^[ \t>*]*(?:From|发件人|寄件者)[ \t]*[:：][ \t]*(.+)$")
_H_OTHER = re.compile(r"(?i)^[ \t>*]*(Subject|主题|主旨|Date|Sent|日期|发送时间|时间|To|收件人|Cc|抄送)[ \t]*[:：][ \t]*(.*)$")


def _who(v: str):
    v = v.strip().strip("*").replace("&lt;", "<").replace("&gt;", ">")
    v = re.sub(r"\[mailto:([^\]]+)\]", r"<\1>", v)
    v = v.rstrip(";；")
    name, addr = parseaddr(v)
    if not addr or "@" not in addr:
        m = re.search(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", v)
        addr = m.group(0) if m else ""
        name = v.replace(addr, "").strip(' "<>()') if addr else v
    return name.strip().strip('"'), addr.lower()


def forward_blocks(text: str) -> list:
    """正文里一层层转发的原信头：[{from_name, from, subject, at}]，外层在前、最里层在后。"""
    lines = text.split("\n")
    marks = {i for i, ln in enumerate(lines) if _FWD_MARK.match(ln)}
    out, i = [], 0
    while i < len(lines):
        m = _H_FROM.match(lines[i])
        if not m:
            i += 1
            continue
        hdr, j = {"from": m.group(1)}, i + 1
        while j < len(lines) and j - i <= 8:
            h = _H_OTHER.match(lines[j])
            if not h:
                break
            k = h.group(1).lower()
            if k in ("subject", "主题", "主旨"):
                hdr["subject"] = h.group(2).strip()
            elif k in ("date", "sent", "日期", "发送时间", "时间"):
                hdr["date"] = h.group(2).strip()
            j += 1
        near_mark = any(i - 4 <= x < i for x in marks)
        if ("subject" in hdr or "date" in hdr) and (near_mark or j - i >= 3):
            name, addr = _who(hdr["from"])
            if addr or name:
                out.append({"from_name": name, "from": addr, "subject": hdr.get("subject", ""), "at": i})
        i = j
    return out


# ---------- PDF 附件里的字 ----------
PDF_MAX_PAGES = 20
PDF_MAX_CHARS = 20000


def pdf_text(data: bytes) -> str:
    if not data[:1024].lstrip().startswith(b"%PDF") or len(data) > 25 * 1024 * 1024:
        return ""
    try:
        import io
        import logging
        logging.getLogger("pypdf").setLevel(logging.ERROR)
        from pypdf import PdfReader
        r = PdfReader(io.BytesIO(data))
        if r.is_encrypted:
            try:
                r.decrypt("")
            except Exception:
                return ""
        parts = []
        for page in r.pages[:PDF_MAX_PAGES]:
            parts.append(page.extract_text() or "")
            if sum(map(len, parts)) > PDF_MAX_CHARS:
                break
        return normalize_text("\n".join(parts))[:PDF_MAX_CHARS]
    except Exception:
        return ""


ATT_HEAD = "—— 附件 {name} ——"


def parse(raw: bytes, uid: int = 0) -> Mail:
    # compat32 比 policy.default 快好几倍（不建头部对象），头部自己解码
    msg = email.message_from_bytes(raw, policy=email.policy.compat32)
    name, addr = parseaddr(_hdr(msg.get("From", "")))
    to = [a for _, a in getaddresses([_hdr(v) for v in msg.get_all("To", [])]) if a]
    try:
        dt = parsedate_to_datetime(_hdr(msg.get("Date")))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    except Exception:
        dt = datetime.now(timezone.utc)
    plain, htm, atts, pdfs = [], [], [], []
    for part in msg.walk():
        if part.is_multipart():
            continue
        fn = part.get_filename()
        if fn:
            fn = _hdr(fn)
        disp = (part.get_content_disposition() or "").lower()
        if fn or disp == "attachment":
            atts.append(fn or "未命名附件")
            if part.get_content_type() == "application/pdf" or (fn or "").lower().endswith(".pdf"):
                try:
                    t = pdf_text(part.get_payload(decode=True) or b"")
                except Exception:
                    t = ""
                if t.strip():
                    pdfs.append((fn or "未命名附件", t))
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
    body = text
    for fname, ptxt in pdfs:
        text += ("\n\n" if text else "") + ATT_HEAD.format(name=fname) + "\n" + ptxt
    fw = forward_blocks(body) if body else []
    inner = fw[-1] if fw else {}
    return Mail(
        uid=uid,
        message_id=_hdr(msg.get("Message-ID", "")).strip(),
        from_name=name,
        from_addr=addr.lower(),
        to=to,
        subject=_hdr(msg.get("Subject", "")).strip(),
        date=dt.isoformat(),
        text=text,
        attachments=atts,
        references=(_hdr(msg.get("References", "")) + " " + _hdr(msg.get("Message-ID", ""))).strip(),
        zhike_mark=_hdr(msg.get("X-Zhike", "")),
        raw=raw,
        body=body,
        orig_from=inner.get("from", ""),
        orig_from_name=inner.get("from_name", ""),
        orig_subject=inner.get("subject", ""),
        fwd_by=([addr.lower()] if fw else []) + [b["from"] for b in fw[:-1]],
    )
