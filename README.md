# harness

현업 과제를 Codex와 함께 풀 때 쓰는 관점 노트와 도구 모음임. 과제 답이나 완성 코드는 들어 있지 않음.

## 1. 가져온 뒤 할 일

```bash
git clone <이 저장소 주소> harness
node -v                     # 20 이상이어야 함 (Playwright 요구사항)
```

필요한 스킬만 설치하고 selftest로 확인함.

```bash
cd harness/skills/screenshot && bash scripts/setup.sh && bash test/selftest.sh
cd ../highlight && bash scripts/setup.sh && bash test/selftest.sh
cd ../e2e && bash scripts/setup.sh && bash test/selftest.sh
cd ../report && bash test/selftest.sh
```

- 설치에는 외부 다운로드(npm, Chromium, apt)와 sudo가 필요함. 첫 스킬은 약 2분, 그다음부터는 브라우저를 다시 받지 않아 빠름
- 설치가 실패하면 그 스킬은 쓰지 않고 브라우저 미리보기로 확인함

## 2. 무엇을 언제 읽는지

| 파일 | 언제 | 누가 |
|---|---|---|
| `notes/perspective.md` | 과제를 시작할 때. 과제에 맞는 작업 규칙을 만들 때 재료로 씀 | Codex에게 읽힘 |
| `notes/prep-guide.md` | 시작 전 | 사람이 읽음 |
| `notes/test-memo.md` | 테스트를 짤 때 | 둘 다 |

## 3. 스킬

| 스킬 | 하는 일 | 설치 |
|---|---|---|
| `screenshot` | 웹 화면을 1920×1080으로 찍고, 요소 좌표를 뽑음 | 필요 (Playwright) |
| `highlight` | 이미지에 빨간 박스를 치거나 일부를 흐림 | 필요 (Playwright) |
| `e2e` | 시나리오대로 화면을 조작하며 장면마다 찍고, 같은 시나리오를 Playwright 테스트 코드로 만듦 | 필요 (Playwright) |
| `report` | 확인 결과를 HTML 보고서 파일 하나로 만듦 (요약, 변경사항·확인 결과 표, GREEN/RED, 캡처) | 없음 |
| `writing-style` | 실무자 메시지와 결과 문서의 문체 | 없음 |
| `session-plan` | 합의한 작업 순서와 진행 상태를 `docs/plan.md`에 기록 | 없음 |
| `session-topics` | 이야기한 주제와 결론을 `docs/topics.md`에 기록. 필요할 때 자동 요약 | 없음 |

브라우저는 모두 창 없이(headless) 돎. 화면이나 미리보기에 영향을 주지 않음.

## 4. 스킬 연결

- `e2e` · `screenshot` → `report`: 장면 캡처와 박스 좌표를 `report.json`에 넣음
- `screenshot` → `highlight`: 좌표를 받아 박스 친 PNG를 만듦
- 모든 글 → `writing-style`

## 5. Codex에 스킬 알려 주기

Codex가 `skills/` 폴더를 스킬로 자동 인식하는지는 확인되지 않음. 인식하지 않으면 이렇게 씀.

> `harness/skills/<이름>/SKILL.md` 를 읽고 그대로 따라 해
