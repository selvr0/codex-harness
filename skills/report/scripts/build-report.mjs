#!/usr/bin/env node
// 확인 보고서를 HTML 파일 하나로 만든다. 캡처는 base64 로 넣어서 파일 하나만 건네면 된다.
//
// 사용: node <report 스킬 폴더>/scripts/build-report.mjs <report.json>
// 결과: report.json 과 같은 폴더의 report.html
//
// report.json 구조 (경로는 report.json 기준 상대 경로 또는 절대 경로):
// {
//   title:   "인터뷰 연습 서비스 확인",
//   date:    "2026-10-25",
//   author:  "작성자",
//   (모든 글에서) `코드` → 코드 글꼴, [[이름]] → 이름 태그
//   lead:    "결론 한 문장",                         // 배열이면 한 줄씩 목록으로 (["공개 설정을 별도 창 없이 칸에서 바로 함", ...])
//   prs:     ["#12", "#13"],                          // 선택
//   changes: [ { item, before, after } ],              // 선택. 맨 위 "변경사항" 표 (항목 | 변경 전 | 변경 후)
//   results: [ { item, where, result, ok } ],          // 맨 위 결과 표. ok:false 면 문제로 표시
//   resultsHead: ["확인 항목", "되어야 하는 것", "결과"], // 선택. 결과 표 머리 (기본: 확인 항목 | 화면·API | 결과)
//   env:     [ ["변경 전", "feat/a"], ["서버", "npm start"] ],
//   terms:   [ ["[[처음 공개]]", { text, table }] ],    // 선택. [[이름]] 태그를 누르면 뜨는 뜻
//   showTermsTable: false,                            // 선택. false 면 terms 를 확인 환경 아래 표로 그리지 않음 (태그 뜻으로만 씀)
//                                                     // [[이름]] 태그를 누르면 같은 이름 줄의 뜻이 태그 아래에 뜸
//   partIntros: {                                     // 선택. 묶음 제목 바로 아래 설명
//     "확인 결과": { text: "...", tables: [{ title: "확인 순서", head, rows }] }
//   },
//   sections: [
//     {
//       part:  "변경사항",                              // 선택. 이 값이 앞 절과 다르면 묶음 제목을 크게 넣음
//                                                       // (맨 위 표마다 번호를 1부터 매길 때, 아래 절도 같은 묶음으로 나눔)
//       title: "답변 제출 화면",
//       text:  ["한 줄에 사실 하나", "..."],          // 선택. 배열이면 목록, 문자열이면 문단
//       compare: [                                      // 변경 전 | 변경 후 좌우 비교
//                                                       // stack: true 면 위아래로 놓음 (넓고 낮은 캡처)
//         { label: "첫 화면",
//           before: { img: "img/01-before.png", boxes: [[16, 606, 1408, 52]], note: "..." },
//           after:  { img: "img/01-after.png",  boxes: [[16, 548, 1888, 92]], note: "..." } }
//       ],
//       steps: [ { label: "1. 답변 입력", img: "img/01.png", boxes: [], note: "..." } ],  // 순서대로 한 장씩
//                                                       // wide: true 면 한 줄 전체 폭 (GIF · 넓은 캡처)
//       table: { head: ["요청", "변경 전", "변경 후"], rows: [["GET /a", "200", "404"]] },
//                                                  // 칸 값 규칙
//                                                  //   { from: "3명 이상", to: "4명 필수" } → 회색 칩 → 진한 칩
//                                                  //   "GREEN" · "RED (설명)"               → 초록 · 빨강 결과 배지
//                                                  //   null                                → 바로 위 칸과 합침 (rowspan)
//                                                  // 칸이 "있음"·"없음"으로 시작하면 칩으로 그림 ("없음 (설명)" 도 됨)
//       code:  "로그 같은 고정폭 텍스트",
//       details: [                                      // 선택. 접어 두는 상세 (테스트 데이터 · 요청 · 응답)
//         { summary: "테스트 데이터", text: "...", table: { head, rows }, code: "..." }
//       ]
//     }
//   ]
// }
//
// boxes: 빨간 박스. [x, y, 너비, 높이] 를 캡처 이미지 픽셀 기준으로 적는다 (getBoundingClientRect × devicePixelRatio)

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, resolve } from 'node:path';

const specPath = process.argv[2];
if (!specPath) {
  console.error('사용: node build-report.mjs <report.json>');
  process.exit(1);
}
const baseDir = dirname(resolve(specPath));
const spec = JSON.parse(readFileSync(specPath, 'utf8'));

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

// `코드` 만 <code> 로 바꾸고 나머지는 이스케이프
// `코드` → <code>, [[이름]] → 이름 태그 (보고서 안에서 정한 이름: 처음 공개, 공개 뒤 수정 등)
const inline = (value) =>
  escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(
      /\[\[([^\]]+)\]\]/g,
      '<button type="button" class="name-tag" data-term="$1">$1</button>'
    );

const MIME_BY_EXT = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.mp4', 'video/mp4'],
]);

// 이미지 헤더에서 크기를 읽음. 박스를 % 로 바꾸는 데 씀
// PNG 는 16~23바이트, GIF 는 6~9바이트(리틀 엔디언)에 크기가 있음
function readImageSize(buffer, path) {
  const isPng = buffer.subarray(1, 4).toString('ascii') === 'PNG';
  if (isPng) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  const isGif = buffer.subarray(0, 3).toString('ascii') === 'GIF';
  if (isGif) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  throw new Error(`PNG · GIF 만 박스를 그릴 수 있음: ${path}`);
}

// 강조 오버레이 (highlight 스킬과 같은 모양):
//   박스 바깥: 검정 60% 로 어둡게
//   박스:      빨간 테두리, 영역보다 BOX_PADDING 만큼 넓게
// 이미지와 같은 좌표계(viewBox = 이미지 픽셀)의 SVG 를 이미지 위에 겹쳐서, 화면 폭이 바뀌어도 같은 곳에 붙음
const BOX_PADDING = 6;
const DIM_OPACITY = 0.6;
// 붙어 있는 두 박스의 테두리 사이에 남길 최소 틈
const BOX_MIN_GAP = 2;
// SVG 선은 사각형 경계 가운데에 그려져서 두께(.box 의 stroke-width 4)의 절반이 바깥으로 나감
const STROKE_OUTSET = 2;

// 박스마다 네 방향 padding 을 정함. 기본은 모두 BOX_PADDING
// 두 박스의 테두리가 겹치거나 BOX_MIN_GAP 보다 가까우면, 마주 보는 쪽 padding 만 줄여 틈을 남김
//   - 위아래로 떨어진 두 박스: 위 박스 bottom, 아래 박스 top 을 줄임
//   - 좌우로 떨어진 두 박스:   왼쪽 박스 right, 오른쪽 박스 left 를 줄임
//   - 영역이 아주 가까우면 padding 이 음수가 되어 테두리가 영역 안쪽을 조금 덮음
// 영역 자체가 겹치는 두 박스는 padding 을 줄여도 안 떨어져서 그대로 둠
// 반환값: boxes 와 같은 순서의 배열
//   [{ left: 6, top: 6, right: 6, bottom: -1 }, ...]
function resolveBoxPaddings(boxes, padding, outset, minGap) {
  const pads = boxes.map(() => ({
    left: padding,
    top: padding,
    right: padding,
    bottom: padding,
  }));
  const outerEdges = (index) => {
    const [x, y, w, h] = boxes[index];
    const pad = pads[index];
    return {
      left: x - pad.left - outset,
      top: y - pad.top - outset,
      right: x + w + pad.right + outset,
      bottom: y + h + pad.bottom + outset,
    };
  };
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const [ax, ay, aw, ah] = boxes[i];
      const [bx, by, bw, bh] = boxes[j];
      // 영역 사이 거리. 음수면 그 축으로는 겹침
      const gapX = Math.max(bx - (ax + aw), ax - (bx + bw));
      const gapY = Math.max(by - (ay + ah), ay - (by + bh));
      if (gapX < 0 && gapY < 0) continue;

      const a = outerEdges(i);
      const b = outerEdges(j);
      const tooClose =
        a.left < b.right + minGap &&
        b.left < a.right + minGap &&
        a.top < b.bottom + minGap &&
        b.top < a.bottom + minGap;
      if (!tooClose) continue;

      // 더 많이 떨어진 축 쪽 padding 을 줄임 (덜 깎임)
      const gap = Math.max(gapX, gapY);
      const limit = Math.floor((gap - minGap) / 2) - outset;
      if (gapY >= gapX) {
        const [upper, lower] = ay < by ? [i, j] : [j, i];
        pads[upper].bottom = Math.min(pads[upper].bottom, limit);
        pads[lower].top = Math.min(pads[lower].top, limit);
      } else {
        const [leftBox, rightBox] = ax < bx ? [i, j] : [j, i];
        pads[leftBox].right = Math.min(pads[leftBox].right, limit);
        pads[rightBox].left = Math.min(pads[rightBox].left, limit);
      }
    }
  }
  return pads;
}

function renderHighlight(boxes, size) {
  const pads = resolveBoxPaddings(
    boxes,
    BOX_PADDING,
    STROKE_OUTSET,
    BOX_MIN_GAP
  );
  const padded = boxes.map(([x, y, w, h], index) => {
    const pad = pads[index];
    return [
      x - pad.left,
      y - pad.top,
      w + pad.left + pad.right,
      h + pad.top + pad.bottom,
    ];
  });
  const holes = padded
    .map(
      ([x, y, w, h]) =>
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="black"/>`
    )
    .join('');
  const strokes = padded
    .map(
      ([x, y, w, h]) =>
        `<rect class="box" x="${x}" y="${y}" width="${w}" height="${h}"/>`
    )
    .join('');
  const maskId = `m${Math.random().toString(36).slice(2, 10)}`;
  return `<svg class="overlay" viewBox="0 0 ${size.width} ${size.height}" preserveAspectRatio="none" aria-hidden="true"><mask id="${maskId}"><rect width="100%" height="100%" fill="white"/>${holes}</mask><rect width="100%" height="100%" fill="black" fill-opacity="${DIM_OPACITY}" mask="url(#${maskId})"/>${strokes}</svg>`;
}

function renderFigure(shot, alt) {
  if (!shot?.img) return '';
  const path = isAbsolute(shot.img) ? shot.img : join(baseDir, shot.img);
  const buffer = readFileSync(path);
  const mime = MIME_BY_EXT.get(extname(path).toLowerCase()) ?? 'image/png';
  const note = shot.note ? `<figcaption>${inline(shot.note)}</figcaption>` : '';
  // 영상은 브라우저 기본 재생바로 보여 줌 (멈춤 · 되감기 · 이동). 자동 재생 · 반복 · 소리 없음
  if (mime.startsWith('video/')) {
    return `<figure><video class="clip" src="data:${mime};base64,${buffer.toString(
      'base64'
    )}" controls autoplay muted loop playsinline aria-label="${escapeHtml(
      alt
    )}"></video>${note}</figure>`;
  }
  const boxes = shot.boxes ?? [];
  const size = boxes.length ? readImageSize(buffer, path) : null;
  const boxHtml = boxes.length ? renderHighlight(boxes, size) : '';
  return `<figure><button type="button" class="shot" aria-label="크게 보기: ${escapeHtml(
    alt
  )}"><img src="data:${mime};base64,${buffer.toString(
    'base64'
  )}" alt="${escapeHtml(alt)}">${boxHtml}</button>${note}</figure>`;
}

// 있음·없음 비교 칸을 칩으로 그림. 흑백이라 색 대신 모양으로 나눔
//   "있음"                → 채운 칩
//   "없음 (관리자만 만듦)" → 점선 칩 + 뒤 설명은 흐린 글씨
// 칸이 이 낱말로 시작할 때만 바꾸고, 문장 중간의 있음·없음은 그대로 둠
const CHIP_CLASS_BY_WORD = new Map([
  ['있음', 'chip-yes'],
  ['없음', 'chip-no'],
]);
const CHIP_WORD_RE = /^(있음|없음)(?=$|[\s(])(.*)$/s;

// 확인 결과 배지. 칸이 GREEN · RED 로 시작하면 색 배지 + 뒤 설명
const RESULT_WORD_RE = /^(GREEN|RED)(?=$|\s)(.*)$/s;

// 값 변경 { from, to } → 이전 값 칩 → 이후 값 칩
function renderValueChange({ from, to }) {
  return `<span class="val-change"><span class="val val-old">${inline(
    from
  )}</span><span class="val-arrow">→</span><span class="val val-new">${inline(
    to
  )}</span></span>`;
}

function renderCell(cell) {
  if (cell && typeof cell === 'object' && 'to' in cell) {
    return renderValueChange(cell);
  }
  const result = RESULT_WORD_RE.exec(String(cell ?? ''));
  if (result) {
    const [, word, rest] = result;
    const note = rest.trim()
      ? ` <span class="chip-note">${inline(rest.trim())}</span>`
      : '';
    return `<span class="badge badge-${word.toLowerCase()}">${word}</span>${note}`;
  }
  const match = CHIP_WORD_RE.exec(String(cell ?? ''));
  if (!match) return inline(cell);
  const [, word, rest] = match;
  const note = rest.trim()
    ? ` <span class="chip-note">${inline(rest.trim())}</span>`
    : '';
  return `<span class="chip ${CHIP_CLASS_BY_WORD.get(
    word
  )}">${word}</span>${note}`;
}

// 칸이 null 이면 바로 위 칸과 합침. 위 칸의 rowspan 을 그만큼 늘림
function countRowspan(rows, rowIndex, colIndex) {
  let span = 1;
  while (rows[rowIndex + span]?.[colIndex] === null) span += 1;
  return span;
}

function renderTable({ head, rows }) {
  const th = head.map((cell) => `<th>${inline(cell)}</th>`).join('');
  const tr = rows
    .map((row, rowIndex) => {
      const tds = row
        .map((cell, colIndex) => {
          if (cell === null) return '';
          const span = countRowspan(rows, rowIndex, colIndex);
          const rowspan = span > 1 ? ` rowspan="${span}"` : '';
          return `<td${rowspan}>${renderCell(cell)}</td>`;
        })
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

// 설명 글: 배열이면 한 줄에 사실 하나씩 목록, 문자열이면 문단
function renderText(text) {
  if (!text?.length) return '';
  if (!Array.isArray(text)) return `<p>${inline(text)}</p>`;
  return `<ul class="facts">${text
    .map((line) => `<li>${inline(line)}</li>`)
    .join('')}</ul>`;
}

// lead 가 배열이면 한 줄씩 목록으로 그림
function renderLead(lead) {
  if (!lead?.length) return '';
  if (!Array.isArray(lead)) return `<p class="lead">${inline(lead)}</p>`;
  const items = lead.map((line) => `<li>${inline(line)}</li>`).join('');
  return `<ul class="lead">${items}</ul>`;
}

function renderChanges(changes) {
  if (!changes?.length) return '';
  return `<section><h2>변경사항</h2>${renderTable({
    head: ['항목', '변경 전', '변경 후'],
    rows: changes.map(({ item, before, after }) => [item, before, after]),
  })}</section>`;
}

function renderResults(results, head = ['확인 항목', '화면·API', '결과']) {
  if (!results?.length) return '';
  const rows = results
    .map(
      ({ item, where, result, ok }) =>
        `<tr class="${ok === false ? 'is-bad' : ''}"><td>${inline(
          item
        )}</td><td>${inline(where)}</td><td class="result">${
          ok === false ? '문제 · ' : ''
        }${renderCell(result)}</td></tr>`
    )
    .join('');
  return `<section><h2>확인 결과</h2><div class="table-wrap"><table><thead><tr>${head
    .map((cell) => `<th>${inline(cell)}</th>`)
    .join('')}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

// part 가 앞 절과 달라질 때마다 묶음 제목(<h2 class="part">)을 먼저 넣음
function renderSectionsWithParts(sections) {
  return sections
    .map((section, index) => {
      const isNewPart =
        section.part && section.part !== sections[index - 1]?.part;
      const intro = isNewPart ? spec.partIntros?.[section.part] : null;
      const introHtml = intro
        ? `<section>${renderText(intro.text)}${(intro.tables ?? [])
            .map(
              (table) =>
                `${
                  table.title ? `<h3>${inline(table.title)}</h3>` : ''
                }${renderTable(table)}`
            )
            .join('')}</section>`
        : '';
      const partTitle = isNewPart
        ? `<h2 class="part">${inline(section.part)}</h2>${introHtml}`
        : '';
      return partTitle + renderSection(section);
    })
    .join('\n');
}

function renderSection(section) {
  const parts = [`<h2>${inline(section.title)}</h2>`];
  if (section.text) parts.push(renderText(section.text));
  for (const pair of section.compare ?? []) {
    parts.push(
      `<div class="compare">${
        pair.label ? `<h3>${inline(pair.label)}</h3>` : ''
      }<div class="pair${
        pair.stack ? ' stack' : ''
      }"><div><p class="tag">변경 전</p>${renderFigure(
        pair.before,
        `${pair.label} 변경 전`
      )}</div><div><p class="tag">변경 후</p>${renderFigure(
        pair.after,
        `${pair.label} 변경 후`
      )}</div></div></div>`
    );
  }
  if (section.steps?.length) {
    const steps = section.steps
      .map(
        (step) =>
          `<li${step.wide ? ' class="wide"' : ''}><h3>${inline(
            step.label
          )}</h3>${renderFigure(step, step.label)}</li>`
      )
      .join('');
    parts.push(`<ol class="steps">${steps}</ol>`);
  }
  if (section.table) parts.push(renderTable(section.table));
  for (const detail of section.details ?? []) {
    const body = [
      detail.text ? `<p>${inline(detail.text)}</p>` : '',
      detail.table ? renderTable(detail.table) : '',
      detail.code ? `<pre>${escapeHtml(detail.code)}</pre>` : '',
    ].join('');
    parts.push(
      `<details><summary>${inline(
        detail.summary
      )}</summary><div class="details-body">${body}</div></details>`
    );
  }
  if (section.code) parts.push(`<pre>${escapeHtml(section.code)}</pre>`);
  return `<section>${parts.join('')}</section>`;
}

/**
 * 이름 태그를 눌렀을 때 띄울 뜻
 * Map<key, value> 를 JSON 으로 넣음:
 *   key:   용어 표 첫 칸에서 [[ ]] · ` 를 뺀 이름 ("처음 공개")
 *   value: 둘째 칸을 HTML 로 바꾼 것
 */
const termDefinitions = Object.fromEntries(
  (spec.terms ?? []).map(([name, meaning]) => [
    String(name).replace(/\[\[|\]\]|`/g, ''),
    renderMeaning(meaning),
  ])
);
const termDefinitionsJson = JSON.stringify(termDefinitions).replaceAll(
  '</',
  '<\\/'
);

// 용어 뜻: 문자열 · 줄 배열 · { text: [...], table: { head, rows } }
function renderMeaning(meaning) {
  if (meaning && typeof meaning === 'object' && !Array.isArray(meaning)) {
    return `${renderText(meaning.text)}${
      meaning.table ? renderTable(meaning.table) : ''
    }`;
  }
  return Array.isArray(meaning) ? renderText(meaning) : inline(meaning);
}

const termsTable =
  spec.terms?.length && spec.showTermsTable !== false
    ? `<section><h2>용어</h2><div class="table-wrap"><table class="terms"><thead><tr><th>용어</th><th>뜻</th></tr></thead><tbody>${spec.terms
        .map(
          ([name, meaning]) =>
            `<tr><td>${inline(name)}</td><td>${renderMeaning(
              meaning
            )}</td></tr>`
        )
        .join('')}</tbody></table></div></section>`
    : '';
const envTable = spec.env?.length
  ? `<section><h2>확인 환경</h2>${renderTable({
      head: ['항목', '내용'],
      rows: spec.env,
    })}</section>`
  : '';
const meta = [spec.date, spec.author, ...(spec.prs ?? [])]
  .filter(Boolean)
  .map(escapeHtml)
  .join(' · ');

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(spec.title)}</title>
<style>
/* 흑백 보고서. 색은 강조 박스(빨강) 하나만 씀 */
:root {
  --bg: #ffffff; --fg: #1c1c1e; --muted: #6b6b70; --line: #dcdcdf; --soft: #f4f4f5;
  --mark: #e5322d; --green: #1f7a3d; --green-soft: #e3f3e8; --red: #c4231e; --red-soft: #fbe6e5;
  --font: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #151516; --fg: #ececee; --muted: #9a9aa0; --line: #343437; --soft: #1f1f21; --green: #5fcf86; --green-soft: #173322; --red: #ff7b72; --red-soft: #3a1a19; color-scheme: dark; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.6 var(--font); }
main { max-width: 1680px; margin: 0 auto; padding-block: 40px 80px; padding-inline: max(16px, 3vw); display: grid; gap: 48px; }
header { display: grid; gap: 8px; border-bottom: 2px solid var(--fg); padding-bottom: 20px; }
h1 { margin: 0; font-size: 28px; line-height: 1.3; text-wrap: balance; }
h2 { margin: 0 0 12px; font-size: 20px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
details { border: 1px solid var(--line); min-width: 0; }
summary { cursor: pointer; padding: 10px 14px; font-weight: 600; }
.details-body { display: grid; gap: 12px; padding: 0 14px 14px; min-width: 0; }
h2.part { margin: 24px 0 0; font-size: 26px; padding-bottom: 10px; border-bottom: 2px solid var(--fg); }
h3 { margin: 0 0 8px; font-size: 15px; }
p { margin: 0 0 12px; max-width: 75ch; }
.meta { color: var(--muted); font-size: 13px; }
.lead { font-size: 17px; font-weight: 600; margin: 0; }
ul.lead { padding-left: 1.2em; display: grid; gap: 4px; }
ul.facts { margin: 0; padding-left: 1.2em; display: grid; gap: 4px; }
section { display: grid; gap: 16px; min-width: 0; }
code { font: 13px var(--mono); background: var(--soft); padding: 1px 5px; border-radius: 4px; }
pre { margin: 0; font: 12.5px/1.6 var(--mono); background: var(--soft); border: 1px solid var(--line); padding: 14px 16px; overflow-x: auto; }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; vertical-align: top; padding: 8px 12px; border-bottom: 1px solid var(--line); }
th { font-weight: 600; color: var(--muted); font-size: 13px; border-bottom: 1px solid var(--fg); }
td.result { font-weight: 600; }
tr.is-bad td { background: var(--soft); }
tr.is-bad td.result { color: var(--mark); }
.chip { display: inline-block; padding: 0 10px; border: 1.5px solid var(--fg); border-radius: 999px; font-size: 12px; font-weight: 700; line-height: 20px; white-space: nowrap; }
.chip-yes { background: var(--fg); color: var(--bg); }
.chip-no { border-style: dashed; border-color: var(--muted); color: var(--muted); }
.chip-note { color: var(--muted); font-size: 13px; }
.badge { display: inline-block; padding: 0 8px; border-radius: 2px; font-size: 12px; font-weight: 800; letter-spacing: 0.04em; line-height: 20px; white-space: nowrap; }
.badge-green { background: var(--green-soft); color: var(--green); border: 1px solid var(--green); }
.badge-red { background: var(--red-soft); color: var(--red); border: 1px solid var(--red); }
.val-change { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 4px; }
.val { display: inline-block; padding: 0 8px; border: 1px solid var(--line); border-radius: 2px; font-size: 13px; line-height: 22px; }
.val-old { color: var(--muted); background: var(--soft); }
.val-new { border-color: var(--fg); font-weight: 700; }
.val-arrow { color: var(--muted); }
.name-tag { display: inline-block; padding: 0 7px; border: 0; border-radius: 2px; background: var(--fg); color: var(--bg); font: inherit; font-size: 0.86em; font-weight: 700; line-height: 1.6; white-space: nowrap; cursor: help; }
.name-tag:hover, .name-tag[aria-expanded="true"] { outline: 2px solid var(--muted); outline-offset: 1px; }
#term-pop { position: absolute; z-index: 10; display: grid; gap: 8px; max-width: min(640px, calc(100vw - 32px)); padding: 10px 12px; border: 1px solid var(--fg); border-radius: 2px; background: var(--bg); color: var(--fg); font-size: 13px; line-height: 1.6; box-shadow: 0 6px 18px rgba(0, 0, 0, .18); }
#term-pop[hidden] { display: none; } /* 위의 display: grid 가 hidden 을 덮지 않게 */
#term-pop strong { display: block; }
.term-pop-head { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
.term-pop-close { border: 1px solid var(--line); border-radius: 2px; background: var(--soft); color: var(--fg); font: inherit; font-size: 16px; line-height: 1; padding: 2px 7px; cursor: pointer; }
.term-pop-close:hover { border-color: var(--fg); }
#term-pop table, table.terms table { font-size: 13px; }
#term-pop th, #term-pop td { padding: 4px 8px; }
table.terms td > ul, table.terms td > p { margin: 0 0 6px; }
.compare { display: grid; gap: 8px; min-width: 0; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.pair > div { min-width: 0; }
.pair.stack { grid-template-columns: 1fr; }
.tag { margin: 0 0 6px; font-size: 12px; font-weight: 700; letter-spacing: .06em; color: var(--muted); }
figure { margin: 0; display: grid; gap: 6px; }
figcaption { font-size: 13px; color: var(--muted); }
.shot { position: relative; display: block; width: 100%; padding: 0; border: 1px solid var(--line); background: var(--soft); cursor: zoom-in; }
.shot img { display: block; width: 100%; height: auto; }
.shot:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }
.overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.box { fill: none; stroke: var(--mark); stroke-width: 4; }
.steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 24px; }
.steps > li.wide { grid-column: 1 / -1; }
video.clip { display: block; width: 100%; max-width: 100%; border: 1px solid var(--line); background: #fff; }
.steps li { min-width: 0; }
dialog { padding: 0; border: 0; max-width: 96vw; max-height: 96vh; background: var(--bg); }
dialog::backdrop { background: rgba(0, 0, 0, .8); }
dialog .shot { cursor: zoom-out; border: 0; }
dialog .shot img { max-height: 96vh; width: auto; max-width: 96vw; }
@media (max-width: 900px) { .pair { grid-template-columns: 1fr; } .steps { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main>
<header>
<h1>${escapeHtml(spec.title)}</h1>
<p class="meta">${meta}</p>
${renderLead(spec.lead)}
</header>
${renderChanges(spec.changes)}
${renderResults(spec.results, spec.resultsHead)}
${envTable}
${termsTable}
${renderSectionsWithParts(spec.sections ?? [])}
</main>
<dialog id="zoom"></dialog>
<div id="term-pop" role="tooltip" hidden></div>
<script>
// 이름 태그를 누르면 태그 바로 아래에 뜻을 띄움. × · 다시 누르기 · 바깥 누르기 · Esc 로 닫음
const TERM_DEFINITIONS = ${termDefinitionsJson};
const termPop = document.getElementById('term-pop');
let openTag = null;
const closeTermPop = () => {
  termPop.hidden = true;
  openTag?.setAttribute('aria-expanded', 'false');
  openTag = null;
};
document.addEventListener('click', (event) => {
  const tag = event.target.closest('.name-tag');
  if (event.target.closest('.term-pop-close')) { closeTermPop(); return; }
  if (!tag) { if (!termPop.contains(event.target)) closeTermPop(); return; }
  if (tag === openTag) { closeTermPop(); return; }
  closeTermPop();
  const name = tag.dataset.term;
  termPop.innerHTML = '<div class="term-pop-head"><strong></strong><button type="button" class="term-pop-close" aria-label="닫기">×</button></div>' + (TERM_DEFINITIONS[name] ?? '용어 표에 뜻이 없음');
  termPop.querySelector('strong').textContent = name;
  termPop.hidden = false;
  const rect = tag.getBoundingClientRect();
  const left = Math.min(rect.left + scrollX, scrollX + document.documentElement.clientWidth - termPop.offsetWidth - 16);
  termPop.style.left = Math.max(16, left) + 'px';
  termPop.style.top = rect.bottom + scrollY + 6 + 'px';
  tag.setAttribute('aria-expanded', 'true');
  openTag = tag;
});
// Esc 는 window 에서 가장 먼저(capture) 받아서, 포커스가 어디 있든 닫힘
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !termPop.hidden) { closeTermPop(); event.preventDefault(); }
}, true);

// 캡처를 누르면 크게 보기, 다시 누르거나 Esc 로 닫기
const zoom = document.getElementById('zoom');
document.addEventListener('click', (event) => {
  const shot = event.target.closest('.shot');
  if (!shot) return;
  if (zoom.contains(shot)) { zoom.close(); return; }
  zoom.replaceChildren(shot.cloneNode(true));
  zoom.showModal();
});
</script>
</body>
</html>
`;

const outPath = join(baseDir, 'report.html');
writeFileSync(outPath, html);
console.log(outPath);
