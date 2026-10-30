#!/usr/bin/env bash
# 설치가 끝난 뒤 e2e 스킬이 실제로 도는지 확인함.
#   1. 시험 앱을 0.0.0.0 에 띄움
#   2. 시나리오를 돌려 장면 3장을 찍고, 테스트 코드를 만듦
#   3. 만든 테스트 코드를 Playwright 로 다시 돌림 (반복 확인)
#   4. 일부러 틀린 시나리오는 실패하고 failure.png 를 남겨야 함
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=4174
OUT=test/out
# Playwright 는 .gitignore 에 적힌 폴더(test/out)의 테스트를 찾지 않음. 그래서 테스트 코드는 따로 둠
SPEC_DIR=test/generated
rm -rf "$OUT" "$SPEC_DIR" && mkdir -p "$OUT"

node test/serve-app.mjs "$PORT" >/dev/null &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true; rm -rf "$SPEC_DIR"' EXIT
sleep 1

echo "[1/3] 시나리오 실행 + 테스트 코드 만들기"
node scripts/run-scenario.mjs --scenario test/scenario-submit.json --out "$OUT/img" \
  --emit-test "$SPEC_DIR/submit.spec.mjs" > "$OUT/result.json"
for shot in 01-first 02-empty 03-result; do
  [ -s "$OUT/img/$shot.png" ] || { echo "  실패: $shot.png 없음"; exit 1; }
done
cp "$SPEC_DIR/submit.spec.mjs" "$OUT/"
echo "  장면 3장, steps.json, submit.spec.mjs 만듦"

echo "[2/3] 만든 테스트 코드를 Playwright 로 돌림"
BASE_URL="http://127.0.0.1:$PORT" npx playwright test "$SPEC_DIR/submit.spec.mjs" --reporter=line

echo "[3/3] 일부러 틀린 시나리오는 실패해야 함"
if node scripts/run-scenario.mjs --scenario test/scenario-broken.json --out "$OUT/broken" >/dev/null 2>&1; then
  echo "  실패: 틀린 확인인데 성공으로 끝남"; exit 1
fi
[ -s "$OUT/broken/failure.png" ] || { echo "  실패: failure.png 없음"; exit 1; }
echo "  통과 (failure.png 남김)"

echo "selftest 끝. $OUT/img 의 PNG 와 $OUT/submit.spec.mjs 를 확인함"
