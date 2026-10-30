// selftest 용 원본 이미지를 만듦. 좌표를 미리 아는 그림이라 박스·흐림 위치를 눈으로 맞춰 볼 수 있음.
// 사용: node test/make-sample-image.mjs <출력.png>
//
// 그림 속 요소 위치 (이미지 픽셀):
//   제목 "인터뷰 연습 기록"   x=40,  y=40,  width=400, height=48
//   API 키 칸                x=40,  y=120, width=360, height=36
//   "답변 제출" 버튼          x=40,  y=190, width=160, height=48
import { chromium } from 'playwright';

const out = process.argv[2] ?? 'sample.png';

const SAMPLE = `<html><body style="margin:0;width:800px;height:300px;background:#fff;font-family:sans-serif">
  <div style="position:absolute;left:40px;top:40px;width:400px;height:48px;font-size:32px;font-weight:bold">인터뷰 연습 기록</div>
  <div style="position:absolute;left:40px;top:120px;width:360px;height:36px;background:#eef0f4;font:18px monospace;line-height:36px">sk-test-1234567890abcdef</div>
  <div style="position:absolute;left:40px;top:190px;width:160px;height:48px;background:#2f6fed;color:#fff;font-size:18px;line-height:48px;text-align:center;border-radius:8px">답변 제출</div>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 300 }, deviceScaleFactor: 1 });
  await page.setContent(SAMPLE);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out });
} finally {
  await browser.close();
}
