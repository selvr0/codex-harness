---
name: screenshot
description: 만든 웹 화면을 PNG로 찍을 때 씀. "화면 캡처해 줘", "스크린샷 찍어 줘", "결과 문서에 넣을 화면 찍어 줘" 같은 요청이면 사용. 요소 위치(좌표)를 같이 뽑아 highlight 스킬로 넘길 수 있음. 사용자가 요청했을 때만 찍음. Linux headless 환경에서 Playwright 하나만 씀.
---

# 화면 찍기 (screenshot)

웹 페이지를 찍어 원본 PNG로 저장함. 이미지에 박스를 치거나 흐리지 않음. 그건 `highlight` 스킬이 함.

브라우저는 창 없이(headless) 돌아감. 사용자 화면이나 미리보기 화면에 영향을 주지 않음.

## 지킬 것

- **사용자가 요청했을 때만 찍음.** 검증 단계라도 먼저 찍을지 물어봄
- **한 번에 하나씩 돌림.** 여러 장이 필요하면 차례로 찍음. Chromium 이 한 번에 수백 MB를 씀

## 설치 (처음 한 번)

```bash
cd <이 스킬 폴더>
bash scripts/setup.sh      # playwright, Chromium(headless 전용), 시스템 라이브러리, 한글 글꼴
bash test/selftest.sh      # 시험 페이지를 찍어 test/out/ 에 남김
```

- selftest 가 끝나면 `test/out/*.png` 를 열어 한글이 제대로 나오는지 확인함
- 설치가 실패하거나 너무 오래 걸리면 이 스킬은 쓰지 않고 브라우저 미리보기로만 확인함

## 찍기

```bash
node <스킬 폴더>/scripts/capture.mjs \
  --url http://127.0.0.1:3000/ \
  --out docs/screenshots/01-submit.png \
  --locate "#submit"
```

| 옵션 | 내용 |
|---|---|
| `--locate <선택자>` | 이 요소의 이미지 좌표를 출력함. 여러 번 줄 수 있음 |
| `--wait <선택자>` | 이 요소가 보일 때까지 기다린 뒤 찍음. 데이터를 늦게 불러오는 화면에 씀 |
| `--full` | 페이지 전체를 찍음. 기본은 보이는 화면(1920×1080)만 |
| `--width`, `--height` | 화면 크기 |

- 선택자는 CSS(`#submit`, `.card button`)와 Playwright 선택자(`text=결과 보기`)를 모두 받음
- `--locate` 요소를 못 찾으면 저장하지 않고 종료 코드 2로 끝남. 선택자를 고치거나 `--wait` 를 줌

### 출력

```
{
  "out": "docs/screenshots/01-submit.png",
  "located": {
    "#submit": [                                     ← 선택자
      { "x": 130, "y": 218, "width": 105, "height": 41 }   ← 걸린 요소 하나의 이미지 좌표 (픽셀)
    ]
  }
}
```

좌표는 저장한 이미지 기준임. `highlight` 스킬의 `--box x,y,width,height` 에 그대로 넣음 (예: `--box 130,218,105,41`).

## 절차

1. **서버 띄우기**: 만든 서비스를 `0.0.0.0` 에 띄움. 찍을 주소는 `http://127.0.0.1:<포트>/`
2. **찍기**: 요구사항 하나당 한 장. 파일 이름은 `<번호>-<무엇>.png`. 강조할 요소가 있으면 `--locate` 를 같이 줌
3. **눈으로 확인**: 찍은 파일을 열어 화면이 다 그려졌는지, 글자가 깨지지 않았는지 확인함. 이미지를 볼 수 있으면 `codex -i <파일>` 로 화면이 요구사항대로인지 확인함
4. **강조가 필요하면**: 출력 좌표를 `highlight` 스킬로 넘김
5. **문서에 넣기**: 결과 문서에 `![설명](docs/screenshots/01-submit.png)` 로 넣음

## 주의

- **한글이 네모로 나오면** 한글 글꼴이 없는 것임. `fonts-nanum` 이나 `fonts-noto-cjk` 를 설치함
- 찍은 이미지에 비밀값(API 키, 토큰)이 보이면 그 요소를 `--locate` 로 잡아 `highlight` 스킬의 `--blur` 로 가림
