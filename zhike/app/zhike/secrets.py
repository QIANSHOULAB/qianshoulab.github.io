"""密码和 AI 钥匙只放用户自己电脑上。

Windows：优先放进「Windows 凭据管理器」（keyring 的 WinVault 后端）；
用不了就退到本地加密文件（DPAPI 加密，只有这台电脑的这个 Windows 用户能解开）。
其它系统（只用于开发和测试）：keyring 能用就用，不能用就退到本地文件。
"""
from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path

from . import APP_ID

try:
    import keyring
    from keyring.errors import KeyringError
except Exception:  # pragma: no cover
    keyring = None
    KeyringError = Exception


def _keyring_usable() -> bool:
    if keyring is None or os.environ.get("ZHIKE_NO_KEYRING"):
        return False
    try:
        from keyring.backends import fail
        kr = keyring.get_keyring()
        if isinstance(kr, fail.Keyring):
            return False
        backends = getattr(kr, "backends", None)
        if backends is not None and not backends:
            return False
        return True
    except Exception:
        return False


# ---- Windows DPAPI ----
def _dpapi(data: bytes, protect: bool) -> bytes:
    import ctypes
    from ctypes import wintypes

    class BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    buf = ctypes.create_string_buffer(data, len(data))
    blob_in = BLOB(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    blob_out = BLOB()
    fn = ctypes.windll.crypt32.CryptProtectData if protect else ctypes.windll.crypt32.CryptUnprotectData
    if protect:
        ok = fn(ctypes.byref(blob_in), "zhike", None, None, None, 0, ctypes.byref(blob_out))
    else:
        ok = fn(ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out))
    if not ok:
        raise OSError("DPAPI failed")
    out = ctypes.string_at(blob_out.pbData, blob_out.cbData)
    ctypes.windll.kernel32.LocalFree(blob_out.pbData)
    return out


class FileVault:
    """本地加密文件。Windows 用 DPAPI；其它系统用 Fernet（测试用）。"""

    def __init__(self, path: Path):
        self.path = Path(path)

    def _enc(self, b: bytes) -> bytes:
        if sys.platform == "win32":
            return _dpapi(b, True)
        from cryptography.fernet import Fernet
        return Fernet(self._key()).encrypt(b)

    def _dec(self, b: bytes) -> bytes:
        if sys.platform == "win32":
            return _dpapi(b, False)
        from cryptography.fernet import Fernet
        return Fernet(self._key()).decrypt(b)

    def _key(self) -> bytes:
        kp = self.path.with_suffix(".key")
        if not kp.exists():
            from cryptography.fernet import Fernet
            kp.write_bytes(Fernet.generate_key())
            try:
                os.chmod(kp, 0o600)
            except OSError:
                pass
        return kp.read_bytes()

    def _all(self) -> dict:
        try:
            return json.loads(self._dec(base64.b64decode(self.path.read_bytes())).decode())
        except FileNotFoundError:
            return {}
        except Exception:
            return {}

    def get(self, name):
        return self._all().get(name)

    def set(self, name, value):
        d = self._all()
        d[name] = value
        self.path.write_bytes(base64.b64encode(self._enc(json.dumps(d).encode())))

    def delete(self, name):
        d = self._all()
        if d.pop(name, None) is not None:
            self.path.write_bytes(base64.b64encode(self._enc(json.dumps(d).encode())))


class Secrets:
    def __init__(self, root: Path):
        self.vault = FileVault(Path(root) / "secrets.bin")
        self.use_keyring = _keyring_usable()

    @property
    def where(self) -> str:
        return "credman" if self.use_keyring else "file"

    def get(self, name: str):
        if self.use_keyring:
            try:
                v = keyring.get_password(APP_ID, name)
                if v is not None:
                    return v
            except Exception:
                pass
        return self.vault.get(name)

    def set(self, name: str, value: str):
        if self.use_keyring:
            try:
                keyring.set_password(APP_ID, name, value)
                self.vault.delete(name)
                return
            except Exception:
                self.use_keyring = False
        self.vault.set(name, value)

    def delete(self, name: str):
        if self.use_keyring:
            try:
                keyring.delete_password(APP_ID, name)
            except Exception:
                pass
        self.vault.delete(name)
