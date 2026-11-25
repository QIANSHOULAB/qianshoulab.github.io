#!/bin/bash
# 模拟器截图（390 宽那台 iPhone）：宝典目录、一本书、布阵图空着、改的时候、工具箱、四个工具、设置。
# 用法：shots.sh <模拟器 UDID> <TieXie.app> <输出目录>
set -uo pipefail
SIM="$1"; APP="$2"; OUT="$3"
BID=lab.qianshou.tiexie
# 134：tool-zhaoyao.idle = 照妖镜还没拍照的样子（跟网页首屏比）；点后面的只管文件名，进哪个界面看点前面的
# 150：tool-dianchao.first = 第一遍刚到（已经是「完成」）；tool-dianchao.fixed = 复查改了一件
# 166：照妖镜 管控线 / 全要 / 没找到管控线（两层表头 s9、没管控线 s13）、整张横拍 s12 两种模式；-dark 是深色外观；
#      tool-zhaoyao.save 出结果就点「存原图」，数模拟器相册多没多一张（::notice:: 写进 Actions 注释）
SCREENS="home book buzhen edit toolbox jiaodu gongshi tool-zhaoyao.idle tool-zhaoyao tool-dianchao settings tool-dianchao.first tool-dianchao.fixed"
SCREENS="$SCREENS tool-zhaoyao.limits tool-zhaoyao.all tool-zhaoyao.none tool-zhaoyao.whole-limits tool-zhaoyao.whole-all"
SCREENS="$SCREENS tool-zhaoyao.limits-dark tool-zhaoyao.all-dark tool-zhaoyao.none-dark tool-zhaoyao.save"
FIX="$PWD/tiexie/ios/Tools/英寸照妖镜/Tests/Fixtures"
DCIM="$HOME/Library/Developer/CoreSimulator/Devices/$SIM/data/Media/DCIM"
photos() { find "$DCIM" -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.heic' -o -iname '*.png' \) 2>/dev/null | wc -l | tr -d ' '; }
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
  EXTRA=(); WAIT=5; SAVE=0
  case "$s" in *-dark) xcrun simctl ui "$SIM" appearance dark ;; *) xcrun simctl ui "$SIM" appearance light ;; esac
  case "$s" in
    tool-zhaoyao) EXTRA=(-TXSample "$PWD/tiexie/ios/Tools/英寸照妖镜/Tests/Fixtures/s6_persp_tilt_shadow.jpg"); WAIT=40 ;;
    tool-zhaoyao.idle) ;;
    tool-zhaoyao.*)
      sub="${s#tool-zhaoyao.}"; PICK=limits; SAMPLE="$FIX/s9_two_level.jpg"; WAIT=45
      case "$sub" in *all*) PICK=all ;; esac
      case "$sub" in none*) SAMPLE="$FIX/s13_no_limits.jpg" ;; whole*) SAMPLE="$FIX/s12_whole.jpg"; WAIT=90 ;; esac
      EXTRA=(-TXSample "$SAMPLE" -tiexie.zhaoyao.pick "$PICK")
      if [ "$sub" = save ]; then
        SAVE=1; BEFORE=$(photos)
        xcrun simctl privacy "$SIM" grant photos-add "$BID" || echo "::warning::给不了相册权限"
        EXTRA+=(-TXSaveOriginal YES)
      fi ;;
    tool-dianchao*) EXTRA=(-TXSample "$PWD/tiexie/ios/Tools/铁件点钞机/Tests/Fixtures/demo-tray.jpg"); WAIT=8
      case "$s" in *.*) EXTRA+=(-TXStage "${s##*.}") ;; esac ;;
  esac
  xcrun simctl launch "$SIM" "$BID" -TXDemo YES -TXScreen "${s%%.*}" ${EXTRA[@]+"${EXTRA[@]}"} -AppleLanguages "(zh-Hans)" -AppleLocale zh_CN >/dev/null
  sleep $WAIT
  png="$OUT/$(printf %02d $i)-$s.png"
  if xcrun simctl io "$SIM" screenshot --type=png "$png" >/dev/null 2>&1; then
    sips --resampleWidth 780 -s format jpeg -s formatOptions 84 "$png" --out "${png%.png}.jpg" >/dev/null && rm "$png"
  else
    echo "::error::截图失败：$s"; fail=1
  fi
  if [ "$SAVE" = 1 ]; then
    AFTER=$(photos)
    NEW=$(find "$DCIM" -type f -newer "$SAMPLE" 2>/dev/null | tail -1)
    DIM=""; [ -n "$NEW" ] && DIM=$(sips -g pixelWidth -g pixelHeight "$NEW" 2>/dev/null | awk '/pixel/{printf "%s ", $2}')
    SRC=$(sips -g pixelWidth -g pixelHeight "$SAMPLE" | awk '/pixel/{printf "%s ", $2}')
    echo "::warning title=166 存原图::相册 $BEFORE → $AFTER 张；新的那张 ${DIM:-没有}（原图 $SRC）"
  fi
  i=$((i+1))
done
ls -la "$OUT"
# 166：单测往 tiexie/ios 下写 notes-*.txt（读出了什么、对上几格），这里转成 Actions 注释（工作流文件推不动，放这儿；
#      一步最多 10 条 notice，只发每个文件前 6 行）
find tiexie/ios -name 'notes-*.txt' 2>/dev/null | while read -r f; do
  head -6 "$f" | while IFS= read -r l; do echo "::notice title=$(basename "$f")::$l"; done
done
exit $fail
