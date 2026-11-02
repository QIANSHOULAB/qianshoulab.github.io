"""草拟回复：有用户自己的 Gemini 免费钥匙就让 AI 写，没有就套模板。只生成文字，不发信。"""
from __future__ import annotations

import json
import re
import socket
import urllib.error
import urllib.request

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"


class AIError(Exception):
    def __init__(self, code, detail=""):
        super().__init__(code)
        self.code, self.detail = code, detail     # quota / key / net / other


def fill_template(tpl: str, mail, fields: dict) -> str:
    vals = {k: (v or {}).get("raw", "") if isinstance(v, dict) else (v or "") for k, v in fields.items()}
    vals.setdefault("发件人", mail.from_name or mail.from_addr)
    vals.setdefault("主题", mail.subject)
    vals.setdefault("称呼", mail.from_name or "您")
    return re.sub(r"\{([^{}]{1,30})\}", lambda m: str(vals.get(m.group(1), m.group(0))), tpl)


def build_prompt(mail, fields: dict, hint: str) -> str:
    facts = "\n".join(f"- {k}：{(v or {}).get('raw', '')}" for k, v in fields.items() if v)
    return (
        "你在替收件人起草一封邮件回复，用户会自己看过再决定发不发。\n"
        "要求：只输出回复正文，不要主题行、不要解释；语言跟来信一致；简短、礼貌、具体；"
        "不知道的事不要编，用【待补】标出来让用户填。\n"
        + (f"用户对这类邮件的回复要求：{hint}\n" if hint.strip() else "")
        + (f"从来信里抽出的信息：\n{facts}\n" if facts else "")
        + f"\n来信发件人：{mail.from_name} <{mail.from_addr}>\n主题：{mail.subject}\n正文：\n{mail.text[:6000]}"
    )


def gemini(key: str, prompt: str, model: str = "gemini-flash-latest", base: str = GEMINI_BASE, timeout: float = 40) -> str:
    url = f"{base}/models/{model}:generateContent"
    body = json.dumps({"contents": [{"role": "user", "parts": [{"text": prompt}]}],
                       "generationConfig": {"temperature": 0.4, "maxOutputTokens": 800}}).encode()
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers={"Content-Type": "application/json", "x-goog-api-key": key})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            info = e.read().decode("utf-8", "replace")
        except Exception:
            info = ""
        if e.code == 429 or "RESOURCE_EXHAUSTED" in info:
            raise AIError("quota", info[:300])
        if e.code in (400, 401, 403) and re.search(r"API_KEY|API key|PERMISSION_DENIED|UNAUTHENTICATED", info):
            raise AIError("key", info[:300])
        raise AIError("other", f"HTTP {e.code} {info[:300]}")
    except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, OSError) as e:
        raise AIError("net", str(e))
    try:
        parts = data["candidates"][0]["content"]["parts"]
        text = "".join(p.get("text", "") for p in parts).strip()
    except (KeyError, IndexError, TypeError):
        raise AIError("other", json.dumps(data)[:300])
    if not text:
        raise AIError("other", "empty")
    return text
