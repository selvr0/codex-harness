#!/usr/bin/env bash
# 설치가 끝난 뒤 highlight 스킬이 실제로 도는지 확인함.
# 좌표를 미리 아는 시험 이미지를 만들고, 박스·흐림을 여러 방식으로 그려 test/out/ 에 남김.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=test/out
rm -rf "$OUT" && mkdir -p "$OUT"

echo "[0/3] 시험 이미지 만들기"
node test/make-sample-image.mjs "$OUT/0-source.png"
SOURCE_SUM=$(sha256sum "$OUT/0-source.png")

echo "[1/3] 버튼 박스 + API 키 흐림"
node scripts/annotate.mjs --in "$OUT/0-source.png" --out "$OUT/1-box-blur.png" \
  --box 40,190,160,48 --blur 40,120,360,36 >/dev/null

echo "[2/3] 박스 두 개, 바깥 어둡게 하지 않음"
node scripts/annotate.mjs --in "$OUT/0-source.png" --out "$OUT/2-two-boxes.png" \
  --box 40,40,400,48 --box 40,190,160,48 --opacity 0 >/dev/null

echo "[3/3] 흐림만 (박스 없음)"
node scripts/annotate.mjs --in "$OUT/0-source.png" --out "$OUT/3-blur-only.png" \
  --blur 40,120,360,36 >/dev/null

echo "[확인] 좌표 형식이 틀리면 실패해야 함"
if node scripts/annotate.mjs --in "$OUT/0-source.png" --out "$OUT/x.png" --box 40,190 2>/dev/null; then
  echo "  실패: 틀린 좌표인데 성공으로 끝남"; exit 1
fi
echo "  통과"

echo "[확인] 원본은 바뀌지 않아야 함"
[ "$(sha256sum "$OUT/0-source.png")" = "$SOURCE_SUM" ] && echo "  통과" || { echo "  실패: 원본이 바뀜"; exit 1; }

echo "selftest 끝. $OUT 의 PNG 를 열어 박스·흐림 위치를 확인함"
