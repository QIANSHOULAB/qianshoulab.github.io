#!/usr/bin/env python3
"""发版后更新千手院总源（仓库根目录 apps.json，AltStore 源格式）里铁屑江湖那一条：版本、日期、大小、下载地址。
用法：update_source.py <版本> <ipa 字节数> <下载地址>。新版本放 versions 第一个（AltStore 把第一个当最新）。"""
import datetime, json, pathlib, re, sys

v, size, url = sys.argv[1], int(sys.argv[2]), sys.argv[3]
ios = pathlib.Path(__file__).resolve().parents[1]
p = ios.parents[1] / "apps.json"
src = json.loads(p.read_text(encoding="utf-8"))
app = next(a for a in src["apps"] if a["bundleIdentifier"] == "lab.qianshou.tiexie")
proj = (ios / "project.yml").read_text(encoding="utf-8")
m = re.search(r'CURRENT_PROJECT_VERSION:\s*"?(\d+)"?', proj)
build = m.group(1) if m else "1"
today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).strftime("%Y-%m-%d")
notes = (ios / "release-notes.md").read_text(encoding="utf-8").strip()
entry = {"version": v, "buildVersion": build, "date": today, "localizedDescription": notes,
         "downloadURL": url, "size": size, "minOSVersion": "26.0"}
app["versions"] = [entry] + [x for x in app.get("versions", []) if x.get("version") != v]
app.update({"version": v, "versionDate": today, "versionDescription": notes, "downloadURL": url, "size": size})
p.write_text(json.dumps(src, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(entry, ensure_ascii=False, indent=2))
