#!/bin/bash
# 字库（OFL）：CI 里现下到 tiexie/ios/Fonts/，不进仓库。整套不打子集（Song 自己会往里加字）。
# 钉在 google/fonts 的固定提交上，下完核 SHA-256，对不上就停。
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p Fonts
get() {
  local url="$1" out="$2" sum="$3"
  if [ -f "Fonts/$out" ] && echo "$sum  Fonts/$out" | shasum -a 256 -c - >/dev/null 2>&1; then return 0; fi
  curl -sSfL --retry 3 -o "Fonts/$out" "$url"
  echo "$sum  Fonts/$out" | shasum -a 256 -c -
}
get "https://raw.githubusercontent.com/google/fonts/406197b91ff39a93061c2c2eeaee67ddf2ae1f0d/ofl/mashanzheng/MaShanZheng-Regular.ttf" \
    MaShanZheng-Regular.ttf 6d2546bb189c732a8ca29af9e22457b152387d158aa459e4ac2ce1e51788b7fb
get "https://raw.githubusercontent.com/google/fonts/2e61f4355afd22b801791b0df176065082423b87/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf" \
    NotoSerifSC.ttf 050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9
ls -la Fonts
