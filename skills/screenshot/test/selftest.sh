#!/usr/bin/env bash
# 설치가 끝난 뒤 screenshot 스킬이 실제로 도는지 확인함.
# 시험 페이지를 0.0.0.0 에 띄우고 여러 방식으로 찍어 test/out/ 에 PNG 와 좌표 JSON 을 남김.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=${PORT:-4173}
OUT=test/out
rm -rf "$OUT" && mkdir -p "$OUT"

node test/serve-sample.mjs "$PORT" >/dev/null &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
sleep 1

URL="http://127.0.0.1:$PORT/"

echo "[1/3] 보이는 화면 찍기"
node scripts/capture.mjs --url "$URL" --out "$OUT/1-viewport.png" >/dev/null

echo "[2/3] 보이는 화면 + 버튼·API 키 좌표"
node scripts/capture.mjs --url "$URL" --out "$OUT/2-located.png" \
  --locate "#submit" --locate ".api-key" > "$OUT/2-located.json"

echo "[3/3] 페이지 전체 + 아래쪽 버튼 좌표 (Playwright 텍스트 선택자)"
node scripts/capture.mjs --url "$URL" --out "$OUT/3-full.png" --full \
  --locate "text=결과 보기" > "$OUT/3-full.json"

echo "[확인] 없는 선택자를 주면 저장하지 않고 실패해야 함"
if node scripts/capture.mjs --url "$URL" --out "$OUT/x.png" --locate "#없는요소" 2>/dev/null || [ -e "$OUT/x.png" ]; then
  echo "  실패: 없는 선택자인데 성공했거나 파일을 남김"; exit 1
fi
echo "  통과"

echo "selftest 끝. $OUT 의 PNG 를 열어 한글이 제대로 나오는지 확인함"
