"""本地存档：设置、规则、进度都是用户电脑上的 JSON 文件，不去任何服务器。"""
from __future__ import annotations

import json
import os
import sys
import threading
from pathlib import Path


def data_dir() -> Path:
    if os.environ.get("ZHIKE_HOME"):
        p = Path(os.environ["ZHIKE_HOME"])
    elif sys.platform == "win32":
        p = Path(os.environ.get("APPDATA", Path.home())) / "QianshouZhike"
    else:
        p = Path.home() / ".zhike"
    p.mkdir(parents=True, exist_ok=True)
    return p


def default_excel_path() -> str:
    base = Path.home() / "Documents"
    if not base.exists():
        base = Path.home()
    return str(base / "知客僧" / "知客僧.xlsx")


DEFAULT_CONFIG = {
    "accounts": [],
    "rules": [],
    "settings": {
        "interval_sec": 120,
        "excel_path": "",
        "ai_model": "gemini-flash-latest",
        "autostart": True,
        "demo": True,
    },
}
DEFAULT_STATE = {"accounts": {}, "pending_rows": [], "processed": [], "log": [], "drafts": []}


class JsonFile:
    def __init__(self, path: Path, default: dict):
        self.path = Path(path)
        self.default = default
        self.lock = threading.RLock()
        self.data = self._load()

    def _load(self):
        try:
            with open(self.path, encoding="utf-8") as f:
                d = json.load(f)
        except FileNotFoundError:
            d = {}
        except (json.JSONDecodeError, OSError):
            # 文件坏了：留个备份，从头来，不让程序打不开
            try:
                self.path.replace(self.path.with_suffix(".broken.json"))
            except OSError:
                pass
            d = {}
        merged = json.loads(json.dumps(self.default))
        for k, v in d.items():
            if isinstance(v, dict) and isinstance(merged.get(k), dict):
                merged[k].update(v)
            else:
                merged[k] = v
        return merged

    def save(self):
        with self.lock:
            tmp = self.path.with_suffix(".tmp")
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=1, default=str)
            os.replace(tmp, self.path)


class Store:
    def __init__(self, root: Path | None = None):
        self.root = Path(root) if root else data_dir()
        self.root.mkdir(parents=True, exist_ok=True)
        self.config = JsonFile(self.root / "config.json", DEFAULT_CONFIG)
        self.state = JsonFile(self.root / "state.json", DEFAULT_STATE)
        if not self.config.data["settings"].get("excel_path"):
            self.config.data["settings"]["excel_path"] = default_excel_path()

    @property
    def settings(self):
        return self.config.data["settings"]

    @property
    def accounts(self):
        return self.config.data["accounts"]

    @property
    def rules(self):
        return self.config.data["rules"]

    def acct_state(self, acct_id):
        return self.state.data["accounts"].setdefault(acct_id, {})

    def log(self, entry: dict, keep: int = 500):
        with self.state.lock:
            lg = self.state.data["log"]
            lg.insert(0, entry)
            del lg[keep:]

    def mark_processed(self, key: str, keep: int = 5000):
        p = self.state.data["processed"]
        p.append(key)
        del p[:-keep]

    def is_processed(self, key: str) -> bool:
        return key in self.state.data["processed"]
