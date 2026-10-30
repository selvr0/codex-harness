#!/usr/bin/env bash
# report 스킬이 도는지 확인함. 설치할 것 없음 (node 기본 모듈만 씀).
# test/sample/report.json 으로 보고서를 만들고, HTML 안에 캡처가 들어갔는지 확인함.
set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/build-report.mjs test/sample/report.json >/dev/null
OUT=test/sample/report.html

[ -s "$OUT" ] || { echo "실패: $OUT 가 없음"; exit 1; }
images=$(grep -o 'data:image/png;base64' "$OUT" | wc -l | tr -d ' ')
[ "$images" -ge 3 ] || { echo "실패: 캡처 3장이 HTML 에 들어가지 않음 ($images 장)"; exit 1; }

echo "selftest 끝. $OUT ($(du -h "$OUT" | cut -f1), 캡처 $images 장)"
echo "브라우저 미리보기로 열거나 screenshot 스킬로 찍어서 눈으로 확인함"
