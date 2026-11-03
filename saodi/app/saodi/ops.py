"""执行器：一批「把 A 挪成 B」的操作，先写账本、两段式改名、可整批撤销。

改名、分文件夹、盯文件夹都走这里，所以撤销只有一套逻辑。
两段式：先把每个源文件改成同目录下的临时名，再改成目标名 ——
这样 a->b、b->a 互换、只改大小写（Windows 不分大小写）都不会撞车。
"""
from __future__ import annotations

import datetime as _dt
import os
import shutil
import threading
import uuid

from . import fsutil as fs

_lock = threading.Lock()


def history_dir() -> str:
    d = os.path.join(fs.home_dir(), "history")
    os.makedirs(d, exist_ok=True)
    return d


def _jpath(batch_id: str) -> str:
    return os.path.join(history_dir(), batch_id + ".json")


def err_code(e: BaseException) -> str:
    """把异常翻成界面认识的代号（文案在界面那边统一管）。"""
    if isinstance(e, PermissionError) or getattr(e, "winerror", None) in (32, 33, 5):
        return "busy"
    if isinstance(e, FileNotFoundError):
        return "gone"
    if isinstance(e, FileExistsError):
        return "exists"
    if getattr(e, "errno", None) == 36 or getattr(e, "winerror", None) in (206, 3):
        return "toolong"
    if getattr(e, "code", None) in ("password", "badarchive", "toobig", "notarchive"):
        return e.code
    if getattr(e, "errno", None) == 28 or getattr(e, "winerror", None) == 112:
        return "diskfull"
    return "oserror"


def _rename(src: str, dst: str) -> None:
    """不覆盖的改名。Windows 的 os.rename 天生不覆盖；POSIX 先查一遍。"""
    if not fs.IS_WIN and os.path.lexists(dst) and os.path.normcase(src) != os.path.normcase(dst):
        raise FileExistsError(dst)
    os.rename(fs.lp(src), fs.lp(dst))


def execute(ops: list[dict], kind: str, label: str = "", progress=None, meta: dict | None = None) -> dict:
    """ops: [{"src": 绝对路径, "dst": 绝对路径, "mode": "move"(默认)|"copy"|"extract"}]。
    copy：复制一份到 dst，原件不动；extract：把压缩包解到 dst 所在文件夹（dst 的名字是想要的文件夹名）。
    返回 {"batch": id, "done": n, "failed": [...]}。"""
    batch_id = _dt.datetime.now().strftime("%Y%m%d-%H%M%S-%f-") + uuid.uuid4().hex[:4]  # 微秒，保证按名字排序 = 按时间
    tag = uuid.uuid4().hex[:8]
    recs = []
    for i, op in enumerate(ops):
        src, dst = os.path.abspath(op["src"]), os.path.abspath(op["dst"])
        tmp = os.path.join(os.path.dirname(src), f".saodi-{tag}-{i}.saodi-tmp")
        rec = {"src": src, "dst": dst, "tmp": tmp, "state": "todo"}
        if op.get("mode") in ("copy", "extract"):
            rec["mode"] = op["mode"]
        recs.append(rec)
    journal = {
        "id": batch_id, "kind": kind, "label": label,
        "time": _dt.datetime.now().isoformat(timespec="seconds"),
        "ops": recs, "made_dirs": [], "undone": False,
    }
    if meta:
        journal.update(meta)
    with _lock:
        fs.write_json(_jpath(batch_id), journal)
        _run(journal, progress)
        fs.write_json(_jpath(batch_id), journal)
    return summarize(journal)


def _ensure_dir(journal: dict, parent: str) -> None:
    if not os.path.isdir(fs.lp(parent)):
        # 记下每一层新建的文件夹，撤销时从深到浅收掉空的
        todo, p = [], parent
        while p and not os.path.isdir(fs.lp(p)):
            todo.append(p)
            p = os.path.dirname(p)
        os.makedirs(fs.lp(parent), exist_ok=True)
        journal["made_dirs"].extend(reversed(todo))


def _copy_or_extract(journal: dict, r: dict) -> None:
    """第零段：复制、解压。它们要读原件，所以排在挪动之前。"""
    parent = os.path.dirname(r["dst"])
    try:
        _ensure_dir(journal, parent)
        if r["mode"] == "extract":
            from . import archive
            r["dst"] = archive.extract(r["src"], parent, os.path.basename(r["dst"]))
        else:
            tmp = os.path.join(parent, f".saodi-{uuid.uuid4().hex[:8]}.saodi-tmp")
            try:
                shutil.copy2(fs.lp(r["src"]), fs.lp(tmp))
                dst = r["dst"]
                if fs.exists(dst):
                    dst = os.path.join(parent, fs.bump(os.path.basename(dst), fs.names_in(parent)))
                    r["dst"], r["bumped"] = dst, True
                _rename(tmp, dst)
            except BaseException:
                if os.path.exists(fs.lp(tmp)):
                    os.remove(fs.lp(tmp))  # 自己刚拷了一半的临时文件
                raise
            r["size"] = os.path.getsize(fs.lp(r["dst"]))
        r["state"] = "done"
    except OSError as e:
        r["state"], r["err"] = "failed", err_code(e)


def _run(journal: dict, progress=None) -> None:
    recs = journal["ops"]
    total = len(recs) * 2 or 1
    step = 0
    for r in recs:
        if r.get("mode") in ("copy", "extract"):
            _copy_or_extract(journal, r)
    # 第一段：源 -> 临时名
    for r in recs:
        step += 1
        if r.get("mode"):
            continue
        if r["src"] == r["dst"]:
            r["state"] = "same"
            continue
        try:
            os.rename(fs.lp(r["src"]), fs.lp(r["tmp"]))
            r["state"] = "tmp"
        except OSError as e:
            r["state"], r["err"] = "failed", err_code(e)
        if progress:
            progress(step, total)
    # 第二段：临时名 -> 目标名（目标被别人抢了就自动加 (2)）
    for r in recs:
        step += 1
        if r["state"] != "tmp":
            continue
        parent = os.path.dirname(r["dst"])
        try:
            _ensure_dir(journal, parent)
            dst = r["dst"]
            if fs.exists(dst):
                dst = os.path.join(parent, fs.bump(os.path.basename(dst), fs.names_in(parent)))
                r["dst"] = dst
                r["bumped"] = True
            _rename(r["tmp"], dst)
            r["state"] = "done"
        except OSError as e:
            r["err"] = err_code(e)
            try:
                os.rename(fs.lp(r["tmp"]), fs.lp(r["src"]))
                r["state"] = "failed"
            except OSError:
                r["state"] = "stuck"  # 极端情况：文件还在临时名上，账本里记着，撤销能救
        if progress:
            progress(step, total)


def summarize(j: dict) -> dict:
    ops = j["ops"]
    return {
        "batch": j["id"], "kind": j["kind"], "label": j.get("label", ""), "time": j["time"], "folder": j.get("folder", ""),
        "done": sum(1 for r in ops if r["state"] == "done"),
        "failed": [{"name": os.path.basename(r["src"]), "err": r.get("err", "oserror")}
                   for r in ops if r["state"] in ("failed", "stuck")],
        "bumped": sum(1 for r in ops if r.get("bumped")),
        "copied": sum(1 for r in ops if r["state"] == "done" and r.get("mode") == "copy"),
        "extracted": sum(1 for r in ops if r["state"] == "done" and r.get("mode") == "extract"),
        "undone": j.get("undone", False),
    }


def history(limit: int = 30) -> list[dict]:
    out = []
    for n in sorted(os.listdir(history_dir()), reverse=True):
        if not n.endswith(".json"):
            continue
        j = fs.read_json(os.path.join(history_dir(), n), None)
        if j and j.get("ops"):
            sm = summarize(j)
            if sm["kind"] == "watch" and not sm["done"]:
                continue  # 盯梢时碰到被占用的文件会反复试，空跑的批次不列
            out.append(sm)
        if len(out) >= limit:
            break
    return out


def last_undoable() -> str | None:
    for h in history(50):
        if not h["undone"] and h["done"]:
            return h["batch"]
    return None


def undo(batch_id: str | None = None) -> dict:
    """把一批操作倒着放回去。用户事后又动过的文件跳过并报出来，不硬来。"""
    batch_id = batch_id or last_undoable()
    if not batch_id:
        return {"ok": False, "err": "nothing"}
    with _lock:
        j = fs.read_json(_jpath(batch_id), None)
        if not j:
            return {"ok": False, "err": "nothing"}
        if j.get("undone"):
            return {"ok": False, "err": "already"}
        back, skipped = [], []
        trashed = 0
        # 复制出来的、解压出来的：进回收站（不是删）；复制品被改过就不碰
        for r in reversed(j["ops"]):
            if r.get("mode") not in ("copy", "extract") or r["state"] != "done":
                continue
            if not fs.exists(r["dst"]):
                skipped.append({"name": os.path.basename(r["dst"]), "err": "gone"})
                continue
            if r["mode"] == "copy" and os.path.getsize(fs.lp(r["dst"])) != r.get("size"):
                skipped.append({"name": os.path.basename(r["dst"]), "err": "changed"})
                continue
            try:
                fs.to_trash(r["dst"])
                r["state"] = "undone"
                trashed += 1
            except OSError as e:
                skipped.append({"name": os.path.basename(r["dst"]), "err": err_code(e)})
        for r in reversed(j["ops"]):
            if r.get("mode"):
                continue
            if r["state"] == "stuck" and fs.exists(r["tmp"]):
                back.append({"src": r["tmp"], "dst": r["src"], "rec": r})
            elif r["state"] == "done":
                if not fs.exists(r["dst"]):
                    skipped.append({"name": os.path.basename(r["dst"]), "err": "gone"})
                    continue
                back.append({"src": r["dst"], "dst": r["src"], "rec": r})
        rj = {"ops": [], "made_dirs": []}
        tag = uuid.uuid4().hex[:8]
        for i, b in enumerate(back):
            tmp = os.path.join(os.path.dirname(b["src"]), f".saodi-{tag}-{i}.saodi-tmp")
            rj["ops"].append({"src": b["src"], "dst": b["dst"], "tmp": tmp, "state": "todo"})
        _run(rj)
        n = 0
        restored = []
        for b, r in zip(back, rj["ops"]):
            if r["state"] == "done":
                b["rec"]["state"] = "undone"
                n += 1
                restored.append(r["dst"])
                if r.get("bumped"):
                    b["rec"]["undo_bumped_to"] = r["dst"]
            else:
                skipped.append({"name": os.path.basename(b["src"]), "err": r.get("err", "oserror")})
        # 撤掉当时新建、现在空了的文件夹（只删空的、只删自己建的）
        for d in sorted(j.get("made_dirs", []), key=len, reverse=True):
            try:
                os.rmdir(fs.lp(d))
            except OSError:
                pass
        j["undone"] = True
        fs.write_json(_jpath(batch_id), j)
    return {"ok": True, "batch": batch_id, "restored": n + trashed, "skipped": skipped, "paths": restored}
