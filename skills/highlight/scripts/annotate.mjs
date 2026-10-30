#!/usr/bin/env node
// 이미 있는 이미지 파일에 빨간 박스를 치거나 일부를 흐림. 원본은 고치지 않고 새 파일로 만듦.
// 이미지 처리 라이브러리 없이, 브라우저에 이미지를 띄우고 덮개를 얹은 뒤 다시 찍는 방식임.
//
// 사용 예:
//   node annotate.mjs --in shot.png --out shot-annotated.png --box 120,340,200,48 --blur 600,20,180,30
import { parseArgs } from 'node:util';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { drawOverlay, parseArea } from './lib/overlay.mjs';

const HELP = `
사용법: node annotate.mjs --in <원본> --out <새 파일.png> [옵션]

  --in <파일>          원본 이미지 (png, jpg, webp)
  --out <파일>         저장할 PNG 경로
  --box x,y,w,h        빨간 박스를 칠 영역 (이미지 픽셀, 왼쪽 위가 0,0). 여러 번 줄 수 있음
  --blur x,y,w,h       흐릴 영역. 여러 번 줄 수 있음
  --opacity <0~1>      박스 바깥 어둡기 (기본 0.6, 0이면 안 어둡게)
  --padding <px>       박스 여백 (기본 6)
`;

const MIME_BY_EXTENSION = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

const { values: opts } = parseArgs({
  options: {
    in: { type: 'string' },
    out: { type: 'string' },
    box: { type: 'string', multiple: true, default: [] },
    blur: { type: 'string', multiple: true, default: [] },
    opacity: { type: 'string', default: '0.6' },
    padding: { type: 'string', default: '6' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (opts.help || !opts.in || !opts.out) {
  console.log(HELP);
  process.exit(opts.help ? 0 : 1);
}

const mime = MIME_BY_EXTENSION[path.extname(opts.in).toLowerCase()];
if (!mime) {
  console.error(`지원하지 않는 이미지 형식: ${opts.in} (png, jpg, webp 만 받음)`);
  process.exit(1);
}

const boxes = opts.box.map((text) => parseArea(text, '--box'));
const blurs = opts.blur.map((text) => parseArea(text, '--blur'));
const dataUrl = `data:${mime};base64,${(await readFile(opts.in)).toString('base64')}`;

const browser = await chromium.launch();
try {
  // deviceScaleFactor 1 이면 CSS px 와 이미지 픽셀이 1:1 로 맞음
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setContent(
    `<html><body style="margin:0"><img id="source" style="display:block" src="${dataUrl}"></body></html>`,
  );
  const size = await page.locator('#source').evaluate(async (img) => {
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight };
  });
  await page.setViewportSize(size);

  await page.evaluate(drawOverlay, {
    boxes,
    blurs,
    padding: Number(opts.padding),
    opacity: Number(opts.opacity),
    stroke: 4,
  });

  await mkdir(path.dirname(path.resolve(opts.out)), { recursive: true });
  await page.screenshot({ path: opts.out, clip: { x: 0, y: 0, ...size } });
  console.log(JSON.stringify({ out: opts.out, size, boxes: boxes.length, blurs: blurs.length }));
} finally {
  await browser.close();
}
