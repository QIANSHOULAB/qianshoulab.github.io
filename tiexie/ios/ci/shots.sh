#!/bin/bash
# 模拟器截图（390 宽那台 iPhone）：宝典目录、一本书、布阵图空着、改的时候、工具箱、四个工具、设置。
# 用法：shots.sh <模拟器 UDID> <TieXie.app> <输出目录>
set -uo pipefail
SIM="$1"; APP="$2"; OUT="$3"
BID=lab.qianshou.tiexie
# 134：tool-zhaoyao.idle = 照妖镜还没拍照的样子（跟网页首屏比）；点后面的只管文件名，进哪个界面看点前面的
# 150：tool-dianchao.first = 第一遍刚到（已经是「完成」）；tool-dianchao.fixed = 复查改了一件
SCREENS="home book buzhen edit toolbox jiaodu gongshi tool-zhaoyao.idle tool-zhaoyao tool-dianchao settings tool-dianchao.first tool-dianchao.fixed"
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
  # 122：两个拍照的工具拿测试用的照片演示（照妖镜真跑一遍 Vision，要多等一会儿）
  EXTRA=(); WAIT=5
  case "$s" in
    tool-zhaoyao) EXTRA=(-TXSample "$PWD/tiexie/ios/Tools/英寸照妖镜/Tests/Fixtures/s6_persp_tilt_shadow.jpg"); WAIT=40 ;;
    tool-dianchao*) EXTRA=(-TXSample "$PWD/tiexie/ios/Tools/铁件点钞机/Tests/Fixtures/demo-tray.jpg"); WAIT=8
      case "$s" in *.*) EXTRA+=(-TXStage "${s##*.}") ;; esac ;;
  esac
  xcrun simctl launch "$SIM" "$BID" -TXDemo YES -TXScreen "${s%%.*}" ${EXTRA[@]+"${EXTRA[@]}"} -AppleLanguages "(zh-Hans)" -AppleLocale zh_CN >/dev/null
  sleep $WAIT
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
