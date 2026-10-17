// 单位正方形 → 任意四边形的单应矩阵（Heckbert 闭式解），输出 CSS matrix3d。
//
// 为什么必须单应：背景板上那块屏幕是梯形（下边比上边宽约 1.5%），
// 单纯 scale/rotate 贴不上，四角必然错位。
//
// 坐标系：quad 是 1920×1080 成片坐标；元素自身坐标是 [0,w]×[0,h]。
// CSS matrix3d 列主序；2D 单应的齐次分量落在第 3 行，对应 CSS 的 m14/m24/m44。

export type Pt = [number, number];

export function homographyMatrix3d(quad: Pt[], w: number, h: number): string {
  const [p0, p1, p2, p3] = quad; // TL, TR, BR, BL
  const [x0, y0] = p0;
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const [x3, y3] = p3;

  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;

  let a: number, b: number, c: number, d: number, e: number, f: number, g2: number, h2: number;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    // 仿射退化：没有透视
    a = x1 - x0;
    b = x2 - x1;
    c = x0;
    d = y1 - y0;
    e = y2 - y1;
    f = y0;
    g2 = 0;
    h2 = 0;
  } else {
    const den = dx1 * dy2 - dx2 * dy1;
    g2 = (dx3 * dy2 - dx2 * dy3) / den;
    h2 = (dx1 * dy3 - dx3 * dy1) / den;
    a = x1 - x0 + g2 * x1;
    b = x3 - x0 + h2 * x3;
    c = x0;
    d = y1 - y0 + g2 * y1;
    e = y3 - y0 + h2 * y3;
    f = y0;
  }

  const h11 = a / w;
  const h12 = b / h;
  const h13 = c;
  const h21 = d / w;
  const h22 = e / h;
  const h23 = f;
  const h31 = g2 / w;
  const h32 = h2 / h;

  const m = [h11, h21, 0, h31, h12, h22, 0, h32, 0, 0, 1, 0, h13, h23, 0, 1];
  return `matrix3d(${m.map((v) => (Math.abs(v) < 1e-12 ? 0 : +v.toFixed(10))).join(",")})`;
}

/** 四边形中心（成片坐标），用于给屏幕外的冷光定位 */
export function quadCenter(quad: Pt[]): Pt {
  const sx = quad.reduce((s, p) => s + p[0], 0) / quad.length;
  const sy = quad.reduce((s, p) => s + p[1], 0) / quad.length;
  return [sx, sy];
}

/**
 * 屏幕在成片里的实际像素宽度（上下两条边的平均长度）。
 * 这是「有效字号」的换算基准：canvas 字号 × (screenWidth / CANVAS_W)。
 */
export function screenWidthInFrame(quad: Pt[]): number {
  const [tl, tr, br, bl] = quad;
  const top = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]);
  const bottom = Math.hypot(br[0] - bl[0], br[1] - bl[1]);
  return (top + bottom) / 2;
}
