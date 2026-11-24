#!/usr/bin/env python3
"""挑一台 iOS 26 的 iPhone 模拟器（runtime 挑最新的 26.x，机型按顺序挑），输出给 $GITHUB_ENV"""
import json, subprocess, sys

data = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "devices", "available", "-j"]))
runtimes = sorted([r for r in data["devices"] if ".iOS-26-" in r], key=lambda r: [int(x) for x in r.split("iOS-")[1].split("-")])
want = ["iPhone 17 Pro", "iPhone 17", "iPhone 16 Pro", "iPhone Air", "iPhone 16"]
for rt in reversed(runtimes):
    devs = [d for d in data["devices"][rt] if d["name"].startswith("iPhone")]
    if not devs:
        continue
    devs.sort(key=lambda d: want.index(d["name"]) if d["name"] in want else 99)
    d = devs[0]
    print(f"SIM_UDID={d['udid']}\nSIM_NAME={d['name']}\nSIM_RUNTIME={rt.split('.')[-1]}")
    print(f"挑了 {d['name']} / {rt}", file=sys.stderr)
    sys.exit(0)
# 一台都没有：建一台
types = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "devicetypes", "-j"]))["devicetypes"]
rts = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "runtimes", "-j"]))["runtimes"]
rt = [r for r in rts if r["identifier"].startswith("com.apple.CoreSimulator.SimRuntime.iOS-26")][-1]
ty = next(t for n in want for t in types if t["name"] == n)
udid = subprocess.check_output(["xcrun", "simctl", "create", "TieXie", ty["identifier"], rt["identifier"]]).decode().strip()
print(f"SIM_UDID={udid}\nSIM_NAME={ty['name']}\nSIM_RUNTIME={rt['identifier'].split('.')[-1]}")
