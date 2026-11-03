"""往同一张 Excel 里追加行。每条规则一张工作表。Excel 被别的程序占着就先排队，松手了再补上。"""
from __future__ import annotations

import os
import re
from datetime import date, datetime
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter


class ExcelLocked(Exception):
    pass


def lock_file(path) -> Path:
    p = Path(path)
    return p.with_name("~$" + p.name)


def is_locked(path) -> bool:
    p = Path(path)
    # Excel 打开文件时会在旁边放一个「~$文件名」的小文件
    if lock_file(p).exists():
        return True
    if not p.exists():
        return False
    try:
        with open(p, "r+b"):
            pass
    except PermissionError:
        return True
    except OSError:
        return False
    return False


def safe_sheet(name: str) -> str:
    s = re.sub(r"[\[\]:*?/\\]", " ", name or "邮件").strip() or "邮件"
    return s[:31]


_replace = os.replace   # 单独拿出来，测试里好模拟「被占用」
FMT = {"date": "yyyy-mm-dd", "datetime": "yyyy-mm-dd hh:mm", "money": "#,##0.00"}


def append_rows(path, sheet: str, columns: list, rows: list):
    """columns: [(列名, 类型)]；rows: [{列名: 值}]。"""
    p = Path(path)
    if is_locked(p):
        raise ExcelLocked(str(p))
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.exists():
        try:
            wb = load_workbook(p)
        except PermissionError:
            raise ExcelLocked(str(p))
    else:
        wb = Workbook()
        wb.remove(wb.active)
    sname = safe_sheet(sheet)
    if sname in wb.sheetnames:
        ws = wb[sname]
        header = [c.value for c in ws[1]] if ws.max_row >= 1 else []
        header = [h for h in header if h is not None]
    else:
        ws = wb.create_sheet(sname)
        header = []
    types = dict(columns)
    changed = False
    for name, _ in columns:
        if name not in header:
            header.append(name)
            changed = True
    if changed or ws.max_row < 1 or ws.cell(1, 1).value is None:
        fill = PatternFill("solid", fgColor="F2F2F7")
        for i, h in enumerate(header, 1):
            c = ws.cell(1, i, h)
            c.font = Font(bold=True)
            c.fill = fill
            c.alignment = Alignment(vertical="center")
            ws.column_dimensions[get_column_letter(i)].width = max(ws.column_dimensions[get_column_letter(i)].width or 0, min(40, max(12, len(str(h)) * 2 + 4)))
        ws.freeze_panes = "A2"
    start = ws.max_row + 1 if ws.cell(1, 1).value is not None else 2
    for r_i, row in enumerate(rows):
        for c_i, h in enumerate(header, 1):
            v = row.get(h)
            if v is None:
                continue
            c = ws.cell(start + r_i, c_i, v)
            t = types.get(h)
            if isinstance(v, datetime):
                c.number_format = FMT["datetime"]
            elif isinstance(v, date):
                c.number_format = FMT["date"]
            elif t == "money" and isinstance(v, (int, float)):
                c.number_format = FMT["money"]
            elif isinstance(v, float) and getattr(v, "unit", None) is not None:
                # 数量：格子里是数字（能求和），单位只是显示格式（200 箱）
                base = "#,##0" if float(v).is_integer() else "#,##0.##"
                u = str(v.unit).replace('"', "")[:12]
                c.value = float(v)
                c.number_format = f'{base} "{u}"' if u else base
    tmp = p.with_name(p.stem + ".zhike-tmp.xlsx")
    wb.save(tmp)
    try:
        _replace(tmp, p)
    except PermissionError:
        try:
            tmp.unlink()
        except OSError:
            pass
        raise ExcelLocked(str(p))
    return len(rows)
