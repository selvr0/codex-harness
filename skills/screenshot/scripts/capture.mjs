#!/usr/bin/env node
// 웹 화면을 찍어 원본 PNG 로 저장함. 이미지에 아무것도 그리지 않음.
// --locate 로 요소를 지정하면 그 요소가 이미지의 어디에 있는지 좌표를 JSON 으로 출력함.
// 박스·흐림은 highlight 스킬이 이 좌표를 받아서 함.
//
// 사용 예:
//   node capture.mjs --url http://127.0.0.1:3000/ --out docs/screenshots/01-main.png
//   node capture.mjs --url http://127.0.0.1:3000/ --out docs/screenshots/01-main.png \
//     --locate "#submit" --locate ".api-key"
import { parseArgs } from 'node:util';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const HELP = `
사용법: node capture.mjs --url <주소> --out <파일.png> [옵션]

  --url <주소>          찍을 페이지
  --out <파일>          저장할 PNG 경로. 폴더가 없으면 만듦
  --locate <선택자>     이 요소의 이미지 좌표를 출력함. 여러 번 줄 수 있음
  --wait <선택자>       이 요소가 보일 때까지 기다린 뒤 찍음
  --full                페이지 전체를 찍음 (기본은 보이는 화면만)
  --width <px>          화면 너비 (기본 1920)
  --height <px>         화면 높이 (기본 1080)

선택자는 CSS 선택자와 Playwright 선택자(text=저장, role=button[name="저장"])를 모두 받음.
`;

const { values: opts } = parseArgs({
  options: {
    url: { type: 'string' },
    out: { type: 'string' },
    locate: { type: 'string', multiple: true, default: [] },
    wait: { type: 'string' },
    full: { type: 'boolean', default: false },
    width: { type: 'string', default: '1920' },
    height: { type: 'string', default: '1080' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (opts.help || !opts.url || !opts.out) {
  console.log(HELP);
  process.exit(opts.help ? 0 : 1);
}

// 선택자에 걸린 요소들이 저장될 이미지의 어디에 있는지 모음.
// 페이지 전체를 찍으면 문서 기준, 보이는 화면만 찍으면 화면 기준 좌표가 이미지 좌표와 같음.
// 반환 구조:
//   [{ x: 120, y: 340, width: 200, height: 48 }, ...]   ← 요소 하나당 하나, 이미지 픽셀
async function locateInImage(page, selector, isFullPage) {
  const areas = await page.locator(selector).evaluateAll(
    (elements, fullPage) =>
      elements
        .map((el) => el.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({
          x: rect.left + (fullPage ? window.scrollX : 0),
          y: rect.top + (fullPage ? window.scrollY : 0),
          width: rect.width,
          height: rect.height,
        })),
    isFullPage,
  );
  return areas.map((area) => ({
    x: Math.round(area.x),
    y: Math.round(area.y),
    width: Math.round(area.width),
    height: Math.round(area.height),
  }));
}

const browser = await chromium.launch();
try {
  // deviceScaleFactor 1 이면 CSS px 와 이미지 픽셀이 1:1 로 맞음
  const page = await browser.newPage({
    viewport: { width: Number(opts.width), height: Number(opts.height) },
    deviceScaleFactor: 1,
  });
  await page.goto(opts.url, { waitUntil: 'networkidle' });
  if (opts.wait) await page.locator(opts.wait).first().waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);

  // 보이는 화면만 찍을 때는 첫 번째 --locate 요소가 화면 안에 들어오게 스크롤함
  if (!opts.full && opts.locate.length > 0) {
    const first = page.locator(opts.locate[0]).first();
    if ((await first.count()) > 0) await first.scrollIntoViewIfNeeded();
  }

  // 결과 구조:
  //   key:   --locate 로 준 선택자
  //   value: 그 선택자에 걸린 요소들의 이미지 좌표 목록
  //   예: { "#submit": [{ x: 130, y: 218, width: 105, height: 41 }] }
  const located = {};
  const missing = [];
  for (const selector of opts.locate) {
    located[selector] = await locateInImage(page, selector, opts.full);
    if (located[selector].length === 0) missing.push(selector);
  }

  if (missing.length > 0) {
    console.error(`화면에서 찾지 못한 선택자: ${missing.join(', ')}`);
    console.error('선택자를 고치거나 --wait 로 화면이 다 그려질 때까지 기다린 뒤 다시 찍음');
    process.exitCode = 2;
  } else {
    await mkdir(path.dirname(path.resolve(opts.out)), { recursive: true });
    await page.screenshot({ path: opts.out, fullPage: opts.full });
    console.log(JSON.stringify({ out: opts.out, located }, null, 2));
  }
} finally {
  await browser.close();
}
