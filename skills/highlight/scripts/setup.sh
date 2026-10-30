#!/usr/bin/env bash
# highlight 스킬 설치. 처음 한 번만 실행함. (screenshot 스킬을 이미 설치했으면 브라우저는 다시 받지 않음)
#
# 하는 일:
#   1. playwright 패키지 설치 (npm)
#   2. Chromium 브라우저 받기 (~/.cache/ms-playwright)
#   3. Chromium 이 쓰는 시스템 라이브러리 설치 (root 또는 sudo 가 될 때만)
#   4. 한글 글꼴이 없으면 설치 (없으면 한글이 네모로 찍힘)
set -euo pipefail
cd "$(dirname "$0")/.."

started=$(date +%s)

# root 면 그대로, sudo 가 비밀번호 없이 되면 sudo 로, 둘 다 아니면 실행하지 않음
as_root() {
  if [ "$(id -u)" -eq 0 ]; then "$@"
  elif sudo -n true 2>/dev/null; then sudo "$@"
  else return 1
  fi
}

echo "[1/4] playwright 패키지 설치"
npm install --no-audit --no-fund --loglevel=error

echo "[2/4] Chromium 받기 (화면 없는 headless 전용만)"
node node_modules/playwright/cli.js install --only-shell chromium

echo "[3/4] 시스템 라이브러리 설치"
if ! as_root "$(command -v node)" node_modules/playwright/cli.js install-deps chromium; then
  echo "  root·sudo 권한이 없어 건너뜀. 브라우저가 안 뜨면 에러에 나온 라이브러리를 확인함"
fi

echo "[4/4] 한글 글꼴 확인"
if command -v fc-list >/dev/null && [ -n "$(fc-list :lang=ko 2>/dev/null)" ]; then
  echo "  한글 글꼴 있음"
elif as_root apt-get install -y -qq fonts-nanum >/dev/null 2>&1 \
  || { as_root apt-get update -qq >/dev/null 2>&1 && as_root apt-get install -y -qq fonts-nanum >/dev/null 2>&1; }; then
  echo "  fonts-nanum 설치함"
else
  echo "  한글 글꼴을 설치하지 못함. 캡처에서 한글이 네모로 보이면 fonts-nanum 이나 fonts-noto-cjk 를 설치함"
fi

echo "설치 끝 ($(( $(date +%s) - started ))초)"
