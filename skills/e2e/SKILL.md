---
name: e2e
description: 만든 웹 서비스를 실제 브라우저에서 시나리오대로 조작하며 확인하고, 장면마다 찍고, 같은 시나리오를 Playwright 테스트 코드로 남길 때 씀. "화면으로 확인해 줘", "e2e 해 줘", "입력하고 제출한 뒤 결과 화면 찍어 줘", "e2e 테스트 만들어 줘" 같은 요청이면 사용. 찍은 장면은 report 스킬로 넘김. Linux headless 환경, 화면 크기 1920×1080.
---

# 화면 확인 (e2e)

한 브라우저 안에서 시나리오대로 열기 · 입력 · 클릭 · 확인을 이어 가며 장면마다 찍음. 앞 장면에서 입력한 값이 다음 장면에도 남음. 브라우저는 창 없이(headless) 돌고, 화면 크기는 1920×1080임.

## 지킬 것

- **사용자가 요청했을 때만 돌림.** 검증 단계라도 먼저 돌릴지 물어봄
- **한 번에 하나씩 돌림.** Chromium 이 한 번에 수백 MB를 씀

## 설치 (처음 한 번)

```bash
cd <이 스킬 폴더>
bash scripts/setup.sh      # playwright, @playwright/test, Chromium(headless 전용), 시스템 라이브러리, 한글 글꼴
bash test/selftest.sh      # 시험 앱으로 시나리오 실행 → 테스트 코드 생성 → 테스트 재실행 → 실패 처리까지 확인
```

## 순서

1. **서버 띄우기**: 만든 서비스를 `0.0.0.0` 에 백그라운드로 띄움
   - 응답이 올 때까지 확인함: `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:<포트>/`
   - 끝나면 내가 띄운 서버만 내림 (`kill <그 PID>`). 이름으로 한꺼번에 끄지 않음
2. **시나리오 쓰기**: 과제 폴더 `docs/e2e/<이름>.json` (형식은 아래)
3. **실행**: 장면을 보고서 `img/` 폴더에 바로 찍고, 테스트 코드도 같이 만듦

    ```bash
    node <이 스킬 폴더>/scripts/run-scenario.mjs \
      --scenario docs/e2e/answer-submit.json \
      --out docs/report/20261031-answer-submit/img \
      --emit-test tests/e2e/answer-submit.spec.mjs
    ```

4. **장면 확인**: 찍은 PNG 를 열어 화면이 다 그려졌는지 봄
5. **보고서로 넘기기**: 출력(그리고 `<out>/steps.json`)의 `steps` 를 `report.json` 의 `sections[].steps` 에 붙임. 이미지 경로와 박스 좌표가 이미 들어 있음
6. **반복 확인**: 만든 테스트 코드를 다시 돌림 (아래 "테스트 코드")

## 시나리오 형식

```json
{
  "name": "답변을 입력하고 제출하면 결과가 나타남",
  "baseUrl": "http://127.0.0.1:3000",
  "steps": [
    { "goto": "/" },
    { "shot": "01-first", "label": "첫 화면", "locate": ["#answer"] },
    { "fill": ["#answer", "안녕하세요"] },
    { "click": "#submit" },
    { "wait": ".result" },
    { "expectText": [".result", "제출됨"] },
    { "shot": "02-result", "label": "제출 후", "locate": [".result"] }
  ]
}
```

| 단계 | 뜻 | 예 |
|---|---|---|
| `goto` | 주소 열기. `baseUrl` 기준 상대 경로 | `{ "goto": "/" }` |
| `fill` | 입력칸에 글자 넣기 | `{ "fill": ["#answer", "안녕하세요"] }` |
| `click` | 누르기 | `{ "click": "#submit" }` |
| `press` | 키 누르기. 요소를 정하면 그 요소에서 누름 | `{ "press": "Enter" }`, `{ "press": ["#answer", "Enter"] }` |
| `wait` | 요소가 보일 때까지 기다리기. 숫자면 그만큼(ms) 기다림 | `{ "wait": ".result" }`, `{ "wait": 500 }` |
| `expectVisible` | 요소가 보여야 함 | `{ "expectVisible": ".result" }` |
| `expectText` | 요소 글자에 이 말이 들어 있어야 함 | `{ "expectText": [".result", "제출됨"] }` |
| `shot` | 지금 화면 찍기. `locate` 요소의 박스 좌표를 같이 뽑음. `full: true` 면 페이지 전체 | `{ "shot": "02-result", "label": "제출 후", "locate": [".result"] }` |

- 선택자는 CSS(`#submit`)와 Playwright 선택자(`text=결과 보기`)를 모두 받음
- 요소를 기다리는 최대 시간은 5초 (`--timeout` 으로 바꿈)
- **확인 단계가 실패하면** 그 순간 화면을 `<out>/failure.png` 로 찍고 종료 코드 1로 끝남. 출력의 `failure` 에 몇 번째 단계가 왜 실패했는지 나옴

## 출력

```
{
  "shots": [...],                         ← 찍은 장면 목록
  "steps": [                              ← report.json 의 sections[].steps 에 그대로 붙임
    { "label": "1. 첫 화면", "img": "img/01-first.png", "boxes": [[68, 192, 760, 120]] }
  ],
  "failure": null,                        ← 실패한 단계 (없으면 null)
  "test": "tests/e2e/answer-submit.spec.mjs"
}
```

`img` 경로는 `--out` 폴더 이름 기준임. `--out` 을 보고서의 `img/` 로 주면 그대로 맞음.

## 테스트 코드

`--emit-test` 로 만든 파일은 같은 시나리오의 Playwright 테스트임. `shot` 단계는 빠지고 조작과 확인만 남음. 시나리오를 고치면 다시 만듦.

처음 한 번, 과제 폴더에 테스트 도구를 설치함 (브라우저는 이미 받아 둔 것을 씀).

```bash
npm install -D @playwright/test@1.64.1
```

다시 돌릴 때:

```bash
BASE_URL=http://127.0.0.1:3000 npx playwright test tests/e2e/ --reporter=line
```

## 주의

- **테스트 코드는 `.gitignore` 에 없는 폴더에 둠** (`tests/e2e/` 등). Playwright 는 `.gitignore` 에 적힌 폴더의 테스트를 찾지 않음. `No tests found` 가 나오면 `.gitignore` 부터 확인함
- 한글이 네모로 나오면 `fonts-nanum` 이나 `fonts-noto-cjk` 를 설치함
- 찍은 화면에 비밀값이 보이면 `highlight` 스킬의 `--blur` 로 가림
