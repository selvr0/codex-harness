#!/usr/bin/env node
// 지금 과제 폴더에서 돌고 있는 Codex 세션 기록을 읽어, 다른 Codex 실행(codex exec)에 주제별 요약을 맡기고
// 결과를 docs/topics.md 에 씀. 사용자가 "주제 정리해" 할 때만 돌림 (매 턴 돌리지 않음 → 토큰 절약).
//
// 사용 (과제 폴더에서, 별도 터미널 탭 권장):
//   node <이 스킬 폴더>/scripts/summarize-topics.mjs
//   node <이 스킬 폴더>/scripts/summarize-topics.mjs --model <가벼운 모델> --dry-run
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HELP = `
사용법: node summarize-topics.mjs [옵션]

  --cwd <폴더>           요약할 세션의 작업 폴더 (기본: 지금 폴더)
  --out <파일>           결과 파일 (기본: docs/topics.md)
  --model <모델>         요약에 쓸 모델 (기본: Codex 기본 모델). 가벼운 모델을 권장함
  --sessions-dir <폴더>  Codex 세션 기록 폴더 (기본: $CODEX_HOME/sessions 또는 ~/.codex/sessions)
  --dry-run              요약을 맡기지 않고, 넘길 대화만 출력함
`;

const { values: opts } = parseArgs({
  options: {
    cwd: { type: 'string', default: process.cwd() },
    out: { type: 'string', default: 'docs/topics.md' },
    model: { type: 'string' },
    'sessions-dir': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});
if (opts.help) {
  console.log(HELP);
  process.exit(0);
}

const MAX_MESSAGES = 400; // 최근 메시지 몇 개까지 넘길지
const MAX_CHARS = 600; // 메시지 하나에서 앞 몇 글자만 넘길지
const workDir = path.resolve(opts.cwd);
const sessionsDir =
  opts['sessions-dir'] ?? path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'sessions');

// sessions/2026/10/31/rollout-*.jsonl 을 모두 찾음
function listSessionFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSessionFiles(full);
    return entry.name.endsWith('.jsonl') ? [full] : [];
  });
}

// 세션 기록 한 줄의 구조 (필요한 것만):
//   { type: "turn_context",  payload: { cwd: "/home/user/work" } }                         ← 작업 폴더
//   { type: "response_item", payload: { type: "message", role: "user" | "assistant",
//                                       content: [{ type: "input_text" | "output_text", text }] } }
function readSession(file) {
  let cwd = null;
  const messages = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const payload = record.payload ?? {};
    if ((record.type === 'turn_context' || record.type === 'session_meta') && payload.cwd) cwd ??= payload.cwd;
    if (record.type !== 'response_item' || payload.type !== 'message') continue;
    if (payload.role !== 'user' && payload.role !== 'assistant') continue;
    const text = (payload.content ?? [])
      .map((part) => part.text ?? '')
      .join('\n')
      .trim();
    // Codex 가 자동으로 넣는 지침 · 환경 블록(<environment_context>, AGENTS.md 내용 등)은 대화가 아니라서 뺌
    if (!text || text.startsWith('<') || text.startsWith('# AGENTS.md')) continue;
    messages.push({ role: payload.role === 'user' ? '사용자' : 'Codex', text: text.slice(0, MAX_CHARS) });
  }
  return { cwd, messages };
}

// 이 작업 폴더의 세션 중 가장 최근에 바뀐 것
const sessions = listSessionFiles(sessionsDir)
  .map((file) => ({ file, mtime: statSync(file).mtimeMs, ...readSession(file) }))
  .filter((session) => session.cwd && path.resolve(session.cwd) === workDir && session.messages.length > 0)
  .sort((a, b) => b.mtime - a.mtime);

if (sessions.length === 0) {
  console.error(`${workDir} 에서 돈 Codex 세션 기록을 ${sessionsDir} 에서 찾지 못함`);
  process.exit(1);
}

const session = sessions[0];
const conversation = session.messages
  .slice(-MAX_MESSAGES)
  .map((m) => `[${m.role}] ${m.text}`)
  .join('\n\n');
const outPath = path.resolve(workDir, opts.out);
const previous = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '(없음)';

const PROMPT = `아래 대화를 주제별로 나눠 docs/topics.md 내용을 만들어 주세요. 파일 내용만 출력하고 다른 말은 쓰지 마세요.

형식:
# 주제

| # | 주제 | 결론 · 결정 | 이유 |
|---|---|---|---|
| 1 | 실무자: 누가 쓰는지 | 선수 본인이 혼자 연습할 때 씀 | 코치가 매번 함께할 수 없음 |

규칙:
- 대화에 나온 순서대로 번호를 매김. 한 주제에 한 줄
- 지금 이야기 중인 마지막 주제는 번호 앞에 ▶ 를 붙임 (하나만)
- 결론이 바뀐 주제는 마지막 결론을 적고 "(변경: 이전 결론 → 새 결론)"을 덧붙임
- 대화에서 확인하거나 합의한 사실만 적음. 추측하지 않음
- Codex 가 제안만 하고 사용자가 아직 동의하지 않았으면 결론 칸에 "제안: …" 으로 적음
- 결론이 아직 없으면 "결론 없음". 이유가 대화에 없으면 이유 칸은 "-"
- 문장은 짧게, ~함 · ~임 으로 끝냄
- 기존 파일이 있으면 번호와 주제 이름을 최대한 유지함

기존 파일:
${previous}

대화 (오래된 것부터, 메시지마다 앞 ${MAX_CHARS}자):
${conversation}
`;

if (opts['dry-run']) {
  console.log(`세션: ${session.file}\n메시지: ${session.messages.length}개\n`);
  console.log(PROMPT);
  process.exit(0);
}

// 요약은 별도 codex exec 로 맡김. 세션 기록을 남기지 않고(--ephemeral), 명령은 못 돌리게(read-only) 함
const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'topics-'));
const lastMessageFile = path.join(tmpDir, 'topics.md');
const args = ['exec', '--ephemeral', '--skip-git-repo-check', '-s', 'read-only', '-C', tmpDir, '-o', lastMessageFile];
if (opts.model) args.push('-m', opts.model);
args.push('-');

console.error(`세션 ${path.basename(session.file)} 의 메시지 ${session.messages.length}개를 요약함…`);
const run = spawnSync('codex', args, { input: PROMPT, encoding: 'utf8', stdio: ['pipe', 'ignore', 'inherit'] });
if (run.status !== 0 || !existsSync(lastMessageFile)) {
  console.error(`codex exec 실패 (종료 코드 ${run.status}). docs/topics.md 는 그대로 둠`);
  process.exit(1);
}

const result = readFileSync(lastMessageFile, 'utf8').trim();
if (!result.startsWith('# 주제')) {
  console.error('요약 결과가 형식과 다름. docs/topics.md 는 그대로 둠. 결과:\n' + result.slice(0, 500));
  process.exit(1);
}
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, result + '\n');
console.error(`${path.relative(workDir, outPath)} 를 고침`);
