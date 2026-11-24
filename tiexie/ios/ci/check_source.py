#!/usr/bin/env python3
"""核一遍千手院总源 apps.json 是不是 AltStore / SideStore 认的源（字段照 AltStore 官方「Make a Source」页）：
源：name、identifier、apps；app：name、bundleIdentifier、developerName、localizedDescription、iconURL、versions、appPermissions；
版本：version、buildVersion、date、downloadURL、size；appPermissions：entitlements 是字符串数组，privacy 是「Info.plist 里的 UsageDescription 键 → 说明」。
给了 Info.plist 路径（plutil -convert json 以后的）就再核一遍：bundle id、版本号、隐私说明跟 .ipa 里的一模一样（不一样 AltStore 会拒装）。
用法：check_source.py [Info.plist 的 json]"""
import json, pathlib, re, sys

p = pathlib.Path(__file__).resolve().parents[3] / "apps.json"
src = json.loads(p.read_text(encoding="utf-8"))
err = []
for k in ["name", "identifier", "apps"]:
    if k not in src: err.append(f"源缺 {k}")
for a in [x for x in src.get("apps", []) if x.get("bundleIdentifier") == "lab.qianshou.tiexie"]:
    for k in ["name", "bundleIdentifier", "developerName", "localizedDescription", "iconURL", "versions", "appPermissions"]:
        if k not in a: err.append(f"app 缺 {k}")
    if a.get("category") and a["category"] not in {"developer", "entertainment", "games", "lifestyle", "other", "photo-video", "social", "utilities"}:
        err.append(f"category 不认：{a['category']}")
    perms = a.get("appPermissions", {})
    if not isinstance(perms.get("entitlements"), list): err.append("entitlements 要是数组")
    if not isinstance(perms.get("privacy"), dict): err.append("privacy 要是字典")
    for v in a.get("versions", []):
        for k in ["version", "buildVersion", "date", "downloadURL", "size"]:
            if k not in v: err.append(f"版本 {v.get('version')} 缺 {k}")
        if not re.match(r"^\d{4}-\d{2}-\d{2}", str(v.get("date", ""))): err.append("date 不是 ISO 8601")
        if not isinstance(v.get("size"), int): err.append("size 要是整数（字节）")
    if len(sys.argv) > 1:
        info = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
        if info.get("CFBundleIdentifier") != a.get("bundleIdentifier"): err.append(f"bundle id 对不上：{info.get('CFBundleIdentifier')}")
        want = {k: v for k, v in info.items() if k.endswith("UsageDescription")}
        if want != perms.get("privacy"): err.append(f"隐私说明对不上：包里 {want}，源里 {perms.get('privacy')}")
        if a.get("versions") and a["versions"][0].get("version") != info.get("CFBundleShortVersionString"):
            err.append(f"版本号对不上：包里 {info.get('CFBundleShortVersionString')}")
        if a.get("versions") and a["versions"][0].get("buildVersion") != info.get("CFBundleVersion"):
            err.append(f"buildVersion 对不上：包里 {info.get('CFBundleVersion')}，源里 {a['versions'][0].get('buildVersion')}")
print("\n".join(err) if err else "apps.json 字段齐，跟包对得上")
sys.exit(1 if err else 0)
