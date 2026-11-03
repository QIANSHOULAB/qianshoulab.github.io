#!/bin/sh
# 0.3.0 复赛：旧版 0.2.1（git 里取出来）和新版轮流跑同一套 6 场景，各 3 轮，同一台机器，谁先跑轮流换。
# 用法：sh huayuan/bench/vs-old.sh <旧版 huayuan 目录（里面有 extension/）> <输出目录>，跑完 python3 huayuan/bench/vs-old-sum.py <输出目录>
# 旧版目录这样取：git archive <0.2.1 的提交> huayuan | tar -x -C <某目录>（只用它的 extension/）
# 两版都用这份 run.js 计时（同一把尺子）：状态写「已下载」就等自己下的那份，没写就照旧点导出
OLD=$1; OUT=$2; HERE=$(cd "$(dirname "$0")" && pwd)
export LANG=C.UTF-8
PORT=${PORT:-8851}; export PORT
old() { node "$HERE/run.js" "$OUT/r$1/o" ours "$OLD/extension" > "$OUT/old-r$1.log" 2>&1; mv "$OUT/r$1/o/ours" "$OUT/r$1/old"; }
new() { node "$HERE/run.js" "$OUT/r$1" ours "$HERE/../extension" > "$OUT/new-r$1.log" 2>&1; }
for i in 1 2 3; do
  if [ $((i % 2)) -eq 1 ]; then old $i; new $i; else new $i; old $i; fi
done
