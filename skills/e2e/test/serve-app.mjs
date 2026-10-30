// selftest 용 시험 앱. 답변을 입력하고 제출하면 잠시 뒤 결과가 나타남. 빈 값으로 제출하면 안내가 나옴.
// 사용: node test/serve-app.mjs <포트>
import http from 'node:http';

const APP_PAGE = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>답변 연습</title>
  <style>
    body { font-family: sans-serif; margin: 0; padding: 40px; background: #f6f7f9; color: #1d2330; }
    .card { background: #fff; border-radius: 12px; padding: 28px; max-width: 760px; }
    textarea { width: 100%; height: 120px; font-size: 16px; padding: 10px; box-sizing: border-box; }
    button { margin-top: 12px; font-size: 16px; padding: 10px 18px; border: none; border-radius: 8px; background: #2f6fed; color: #fff; }
    .result { margin-top: 20px; padding: 16px; border-radius: 8px; background: #e8f5ec; }
    .error { margin-top: 20px; color: #c62828; }
  </style>
</head>
<body>
  <div class="card">
    <h1>인터뷰 답변 연습</h1>
    <p>질문: 오늘 경기에서 가장 기억에 남는 순간은 무엇입니까?</p>
    <textarea id="answer" placeholder="답변을 입력하세요"></textarea>
    <button id="submit">답변 제출</button>
    <div id="out"></div>
  </div>
  <script>
    document.getElementById('submit').addEventListener('click', () => {
      const answer = document.getElementById('answer').value.trim();
      const out = document.getElementById('out');
      if (!answer) { out.innerHTML = '<p class="error">답변을 입력해주세요</p>'; return; }
      setTimeout(() => {
        out.innerHTML = '<div class="result"><b>제출됨</b><p></p></div>';
        out.querySelector('.result p').textContent = answer;
      }, 400);
    });
  </script>
</body>
</html>`;

const port = Number(process.argv[2] ?? 4174);
http
  .createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(APP_PAGE);
  })
  .listen(port, '0.0.0.0', () => console.log(`시험 앱: http://0.0.0.0:${port}/`));
