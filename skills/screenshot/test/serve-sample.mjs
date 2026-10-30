// selftest 용 시험 페이지 서버. 외부 패키지 없이 node 내장 http 로 0.0.0.0 에 띄움.
// 사용: node test/serve-sample.mjs <포트>
import http from 'node:http';

const SAMPLE_PAGE = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>캡처 시험 페이지</title>
  <style>
    body { font-family: sans-serif; margin: 0; padding: 32px; background: #f6f7f9; color: #1d2330; }
    .card { background: #fff; border-radius: 12px; padding: 24px; margin-bottom: 24px; max-width: 720px; }
    button { font-size: 16px; padding: 10px 18px; border-radius: 8px; border: 1px solid #c9ced8; background: #fff; }
    #submit { background: #2f6fed; color: #fff; border: none; }
    .api-key { font-family: monospace; background: #eef0f4; padding: 6px 10px; border-radius: 6px; }
    .spacer { height: 1200px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>인터뷰 연습 기록</h1>
    <p>선수가 답변을 녹음하고 다시 들어 볼 수 있는 화면입니다. 한글 글꼴이 제대로 나오는지 확인합니다.</p>
    <p>API 키: <span class="api-key">sk-test-1234567890abcdef</span></p>
    <button id="cancel">취소</button>
    <button id="submit">답변 제출</button>
  </div>
  <div class="spacer"></div>
  <div class="card">
    <h2>페이지 아래쪽 영역</h2>
    <button>결과 보기</button>
  </div>
</body>
</html>`;

const port = Number(process.argv[2] ?? 4173);
http
  .createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(SAMPLE_PAGE);
  })
  .listen(port, '0.0.0.0', () => console.log(`시험 페이지: http://0.0.0.0:${port}/`));
