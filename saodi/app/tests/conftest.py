"""0.3 以前的测试都是照中文写的（分出来叫「图片」「文档」）：一律先定成中文。英文那套在 test_v04.py 里自己切。"""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from saodi import text  # noqa: E402


@pytest.fixture(autouse=True)
def _lang_zh(monkeypatch):
    monkeypatch.setenv("SAODI_LANG", "zh")
    text.set_lang("zh")
    yield
    text.set_lang("zh")
