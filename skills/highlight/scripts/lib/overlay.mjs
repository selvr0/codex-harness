// 브라우저 페이지 안에서 실행되는 함수. page.evaluate(drawOverlay, options) 로 넘김.
// 강조할 영역마다 빨간 박스를 치고, 박스 바깥을 어둡게 덮고, 흐릴 영역을 흐림.
// 페이지 내용은 건드리지 않고 맨 위에 덮개 한 장(div)을 얹는 방식임.
//
// options 구조:
//   boxes:   강조할 영역 목록
//            [{ x: 120, y: 340, width: 200, height: 48 }, ...]
//            좌표는 문서 기준 CSS px (왼쪽 위가 0,0, 스크롤 위치 포함)
//   blurs:   흐릴 영역 목록. 구조와 좌표 기준은 boxes 와 같음
//   padding: 6     박스를 영역보다 바깥으로 넓게 칠 px
//   opacity: 0.6   박스 바깥 어둡기. 0 이면 어둡게 하지 않음
//   stroke:  4     박스 테두리 두께 px
export function drawOverlay({ boxes, blurs, padding, opacity, stroke }) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const root = document.documentElement;
  const width = Math.max(root.scrollWidth, root.clientWidth);
  const height = Math.max(root.scrollHeight, root.clientHeight);

  document.getElementById('__shot-overlay')?.remove();
  const layer = document.createElement('div');
  layer.id = '__shot-overlay';
  Object.assign(layer.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: 'none',
    zIndex: '2147483647',
  });

  // 흐림: 영역 위에 backdrop-filter 를 건 투명 div 를 얹음. 글자 크기와 상관없이 읽히지 않게 8px 로 고정함
  for (const area of blurs) {
    const cover = document.createElement('div');
    Object.assign(cover.style, {
      position: 'absolute',
      left: `${area.x}px`,
      top: `${area.y}px`,
      width: `${area.width}px`,
      height: `${area.height}px`,
      backdropFilter: 'blur(8px)',
      webkitBackdropFilter: 'blur(8px)',
    });
    layer.appendChild(cover);
  }

  const padded = boxes.map((box) => ({
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + padding * 2,
    height: box.height + padding * 2,
  }));

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  Object.assign(svg.style, { position: 'absolute', left: '0', top: '0' });

  const makeRect = (area, attrs) => {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', area.x);
    rect.setAttribute('y', area.y);
    rect.setAttribute('width', area.width);
    rect.setAttribute('height', area.height);
    for (const [key, value] of Object.entries(attrs)) rect.setAttribute(key, value);
    return rect;
  };

  // 어둡게: 전체를 검은 반투명으로 덮되, 마스크로 박스 자리만 뚫음
  if (opacity > 0 && padded.length > 0) {
    const mask = document.createElementNS(SVG_NS, 'mask');
    mask.setAttribute('id', '__shot-mask');
    mask.appendChild(makeRect({ x: 0, y: 0, width, height }, { fill: 'white' }));
    for (const area of padded) mask.appendChild(makeRect(area, { fill: 'black' }));
    svg.appendChild(mask);
    svg.appendChild(
      makeRect({ x: 0, y: 0, width, height }, {
        fill: 'black',
        'fill-opacity': opacity,
        mask: 'url(#__shot-mask)',
      }),
    );
  }

  for (const area of padded) {
    svg.appendChild(makeRect(area, { fill: 'none', stroke: '#ff2d2d', 'stroke-width': stroke }));
  }

  layer.appendChild(svg);
  root.appendChild(layer);
}

// "x,y,w,h" 문자열을 { x, y, width, height } 로 바꿈. 형식이 틀리면 에러를 던짐
export function parseArea(text, optionName) {
  const parts = text.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`${optionName} 형식이 틀림: "${text}" (예: 120,340,200,48)`);
  }
  const [x, y, width, height] = parts;
  return { x, y, width, height };
}
