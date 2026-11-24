#!/bin/bash
# 模拟器截图（390 宽那台 iPhone）：宝典目录、一本书、布阵图空着、改的时候、工具箱、两个工具、设置。
# 用法：shots.sh <模拟器 UDID> <TieXie.app> <输出目录>
set -uo pipefail
SIM="$1"; APP="$2"; OUT="$3"
BID=lab.qianshou.tiexie
SCREENS="home book buzhen edit toolbox jiaodu gongshi settings"
xcrun simctl boot "$SIM" 2>/dev/null || true
xcrun simctl bootstatus "$SIM" -b >/dev/null
xcrun simctl status_bar "$SIM" override --time "9:41" --dataNetwork wifi --wifiMode active --wifiBars 3 \
  --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100 || true
xcrun simctl ui "$SIM" appearance light
xcrun simctl install "$SIM" "$APP"
rm -rf "$OUT"; mkdir -p "$OUT"
fail=0; i=1
for s in $SCREENS; do
  xcrun simctl terminate "$SIM" "$BID" >/dev/null 2>&1 || true
  xcrun simctl launch "$SIM" "$BID" -TXDemo YES -TXScreen "$s" -AppleLanguages "(zh-Hans)" -AppleLocale zh_CN >/dev/null
  sleep 5
  png="$OUT/$(printf %02d $i)-$s.png"
  if xcrun simctl io "$SIM" screenshot --type=png "$png" >/dev/null 2>&1; then
    sips --resampleWidth 780 -s format jpeg -s formatOptions 84 "$png" --out "${png%.png}.jpg" >/dev/null && rm "$png"
  else
    echo "截图失败：$s"; fail=1
  fi
  i=$((i+1))
done
ls -la "$OUT"
exit $fail
