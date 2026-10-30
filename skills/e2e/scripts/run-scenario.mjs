#!/usr/bin/env node
// 시나리오 파일대로 브라우저 하나에서 화면을 조작하고, 장면마다 찍음.
// 확인(expect) 단계가 실패하면 그 순간 화면을 찍고 종료 코드 1로 끝남.
// --emit-test 를 주면 같은 시나리오를 Playwright 테스트 코드로도 만들어, 나중에 몇 번이고 다시 돌릴 수 있게 함.
//
// 사용 예:
//   node run-scenario.mjs --scenario docs/e2e/answer-submit.json --out docs/report/20261031-answer/img
//   node run-scenario.mjs --scenario docs/e2e/answer-submit.json --out docs/report/20261031-answer/img \
//     --emit-test tests/e2e/answer-submit.spec.mjs
import { parseArgs } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const HELP = `
사용법: node run-scenario.mjs --scenario <시나리오.json> --out <캡처 폴더> [옵션]

  --scenario <파일>     시나리오 파일 (형식은 SKILL.md)
  --out <폴더>          장면 캡처를 저장할 폴더. 보고서의 img/ 폴더를 주면 됨
  --emit-test <파일>    같은 시나리오를 Playwright 테스트 코드로도 만듦 (예: tests/e2e/x.spec.mjs)
  --width <px>          화면 너비 (기본 1920)
  --height <px>         화면 높이 (기본 1080)
  --timeout <ms>        요소를 기다리는 최대 시간 (기본 5000)
`;

const { values: opts } = parseArgs({
  options: {
    scenario: { type: 'string' },
    out: { type: 'string' },
    'emit-test': { type: 'string' },
    width: { type: 'string', default: '1920' },
    height: { type: 'string', default: '1080' },
    timeout: { type: 'string', default: '5000' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (opts.help || !opts.scenario || !opts.out) {
  console.log(HELP);
  process.exit(opts.help ? 0 : 1);
}

// 시나리오 파일 구조:
//   name:    "답변 제출"                         ← 테스트 이름으로도 씀
//   baseUrl: "http://127.0.0.1:3000"            ← goto 의 상대 경로 기준
//   steps:   [{ goto: "/" }, { fill: ["#answer", "안녕하세요"] }, ...]
const scenario = JSON.parse(await readFile(opts.scenario, 'utf8'));
const steps = scenario.steps ?? [];
const timeout = Number(opts.timeout);
const toUrl = (target) => new URL(target, scenario.baseUrl ?? 'http://127.0.0.1:3000').href;

// 단계 하나를 사람이 읽을 수 있는 한 줄로 바꿈 (진행 로그와 실패 메시지에 씀)
function describeStep(step) {
  const [action] = Object.keys(step).filter((key) => !['locate', 'label', 'full'].includes(key));
  return `${action} ${JSON.stringify(step[action])}`;
}

// 선택자에 걸린 요소들이 찍힌 이미지의 어디에 있는지 모음. screenshot 스킬의 --locate 와 같은 방식임.
// 반환 구조:
//   [{ x: 40, y: 120, width: 600, height: 48 }, ...]   ← 요소 하나당 하나, 이미지 픽셀
async function locateInImage(page, selector, isFullPage) {
  return page.locator(selector).evaluateAll(
    (elements, fullPage) =>
      elements
        .map((el) => el.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({
          x: Math.round(rect.left + (fullPage ? window.scrollX : 0)),
          y: Math.round(rect.top + (fullPage ? window.scrollY : 0)),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        })),
    isFullPage,
  );
}

// 단계 하나를 실행함. shot 단계면 찍은 장면 정보를 돌려줌
async function runStep(page, step) {
  if ('goto' in step) {
    await page.goto(toUrl(step.goto), { waitUntil: 'networkidle' });
  } else if ('fill' in step) {
    const [selector, text] = step.fill;
    await page.locator(selector).fill(text, { timeout });
  } else if ('click' in step) {
    await page.locator(step.click).click({ timeout });
  } else if ('press' in step) {
    if (Array.isArray(step.press)) await page.locator(step.press[0]).press(step.press[1], { timeout });
    else await page.keyboard.press(step.press);
  } else if ('wait' in step) {
    if (typeof step.wait === 'number') await page.waitForTimeout(step.wait);
    else await page.locator(step.wait).first().waitFor({ state: 'visible', timeout });
  } else if ('expectVisible' in step) {
    await page.locator(step.expectVisible).first().waitFor({ state: 'visible', timeout });
  } else if ('expectText' in step) {
    const [selector, expected] = step.expectText;
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout });
    const deadline = Date.now() + timeout;
    let actual = await locator.innerText();
    while (!actual.includes(expected) && Date.now() < deadline) {
      await page.waitForTimeout(100);
      actual = await locator.innerText();
    }
    if (!actual.includes(expected)) {
      throw new Error(`"${selector}" 글자에 "${expected}" 가 없음. 실제: "${actual}"`);
    }
  } else if ('shot' in step) {
    const file = `${step.shot}.png`;
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(opts.out, file), fullPage: Boolean(step.full) });
    const boxes = [];
    for (const selector of step.locate ?? []) {
      const areas = await locateInImage(page, selector, Boolean(step.full));
      if (areas.length === 0) throw new Error(`장면 "${step.shot}" 에서 찾지 못한 선택자: ${selector}`);
      boxes.push(...areas.map((a) => [a.x, a.y, a.width, a.height]));
    }
    return { file, label: step.label ?? step.shot, boxes };
  } else {
    throw new Error(`모르는 단계: ${JSON.stringify(step)}`);
  }
  return null;
}

// 시나리오를 Playwright 테스트 코드로 바꿈. shot 단계는 테스트에서 뺌 (확인만 남김)
function buildPlaywrightTest() {
  const q = (value) => JSON.stringify(value);
  const lines = [];
  for (const step of steps) {
    if ('goto' in step) lines.push(`  await page.goto(new URL(${q(step.goto)}, BASE_URL).href);`);
    else if ('fill' in step) lines.push(`  await page.locator(${q(step.fill[0])}).fill(${q(step.fill[1])});`);
    else if ('click' in step) lines.push(`  await page.locator(${q(step.click)}).click();`);
    else if ('press' in step && Array.isArray(step.press))
      lines.push(`  await page.locator(${q(step.press[0])}).press(${q(step.press[1])});`);
    else if ('press' in step) lines.push(`  await page.keyboard.press(${q(step.press)});`);
    else if ('wait' in step && typeof step.wait === 'number') lines.push(`  await page.waitForTimeout(${step.wait});`);
    else if ('wait' in step) lines.push(`  await page.locator(${q(step.wait)}).first().waitFor();`);
    else if ('expectVisible' in step)
      lines.push(`  await expect(page.locator(${q(step.expectVisible)}).first()).toBeVisible();`);
    else if ('expectText' in step)
      lines.push(`  await expect(page.locator(${q(step.expectText[0])}).first()).toContainText(${q(step.expectText[1])});`);
  }
  return [
    `// e2e 스킬이 시나리오 ${path.basename(opts.scenario)} 에서 만든 테스트임. 시나리오를 고치면 다시 만듦.`,
    `// 실행: BASE_URL=${scenario.baseUrl ?? 'http://127.0.0.1:3000'} npx playwright test ${opts['emit-test']}`,
    `import { test, expect } from '@playwright/test';`,
    ``,
    `const BASE_URL = process.env.BASE_URL ?? ${q(scenario.baseUrl ?? 'http://127.0.0.1:3000')};`,
    ``,
    `test.use({ viewport: { width: ${Number(opts.width)}, height: ${Number(opts.height)} } });`,
    ``,
    `test(${q(scenario.name ?? path.basename(opts.scenario, '.json'))}, async ({ page }) => {`,
    ...lines,
    `});`,
    ``,
  ].join('\n');
}

await mkdir(opts.out, { recursive: true });
const shots = [];
let failure = null;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: Number(opts.width), height: Number(opts.height) },
    deviceScaleFactor: 1,
  });
  for (const [index, step] of steps.entries()) {
    const line = `[${index + 1}/${steps.length}] ${describeStep(step)}`;
    try {
      const shot = await runStep(page, step);
      if (shot) shots.push(shot);
      console.error(`${line}  ok`);
    } catch (error) {
      await page.screenshot({ path: path.join(opts.out, 'failure.png') }).catch(() => {});
      failure = { step: index + 1, action: describeStep(step), message: error.message.split('\n')[0] };
      console.error(`${line}  실패: ${failure.message}`);
      break;
    }
  }
} finally {
  await browser.close();
}

if (opts['emit-test']) {
  await mkdir(path.dirname(path.resolve(opts['emit-test'])), { recursive: true });
  await writeFile(opts['emit-test'], buildPlaywrightTest());
}

// 출력 구조:
//   shots:  찍은 장면 목록 [{ file, label, boxes }]
//   steps:  report.json 의 sections[].steps 에 그대로 붙이는 조각
//           [{ label: "1. 첫 화면", img: "img/01-first.png", boxes: [[x, y, w, h]] }]
//           img 경로는 --out 폴더 이름 기준이라, --out 을 보고서의 img/ 로 주면 그대로 맞음
//   failure: 실패한 단계 (없으면 null). 실패 순간 화면은 <out>/failure.png
const imgFolder = path.basename(path.resolve(opts.out));
const reportSteps = shots.map((shot, i) => ({
  label: `${i + 1}. ${shot.label}`,
  img: `${imgFolder}/${shot.file}`,
  boxes: shot.boxes,
}));
const result = { shots, steps: reportSteps, failure, test: opts['emit-test'] ?? null };
await writeFile(path.join(opts.out, 'steps.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exitCode = failure ? 1 : 0;
