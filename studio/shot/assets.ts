// 生成的素材（即梦 text2image）加载与取用。
//
// canvas 里画图片要求图片**已经解码完成**，否则 drawImage 会静默失败或者画一半。
// Remotion 的逐帧渲染不会等你，所以必须用 delayRender 把首帧挂住，
// 等全部素材 onload 之后再 continueRender。
//
// 素材分三组（见 studio/tools/gen-assets.py）：
//   c01~c12  卡片配图（抽象/材质/微距）
//   b01~b08  背景底纹
//   o01~o10  3D 静物（物体形状，用于实体感画面）

import { continueRender, delayRender, staticFile } from "remotion";

export const CARD_IMAGES = [
  "c01", "c02", "c03", "c04", "c05", "c06",
  "c07", "c08", "c09", "c10", "c11", "c12",
];
export const BG_IMAGES = ["b01", "b02", "b03", "b04", "b05", "b06", "b07", "b08"];
export const OBJECT_IMAGES = ["o01", "o02", "o03", "o04", "o05", "o06", "o07", "o08", "o09", "o10"];

const ALL = [...CARD_IMAGES, ...BG_IMAGES, ...OBJECT_IMAGES];
const cache = new Map<string, HTMLImageElement>();
let started = false;
let done = false;
const listeners = new Set<() => void>();

/** 素材就绪时回调（组件用它触发一次重绘，否则首帧会画成灰块） */
export function onAssetsReady(cb: () => void): () => void {
  if (done) {
    cb();
    return () => {};
  }
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** 在组件渲染期调用一次；首帧会被挂住直到全部加载完 */
export function ensureAssets(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const handle = delayRender("loading generated assets");
  Promise.all(
    ALL.map(
      (k) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            cache.set(k, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = staticFile(`gen/${k}.png`);
        }),
    ),
  ).then(() => {
    done = true;
    listeners.forEach((cb) => cb());
    listeners.clear();
    continueRender(handle);
  });
}

export function getAsset(key: string): HTMLImageElement | null {
  return done ? cache.get(key) ?? null : null;
}

/** 按内容哈希挑一张卡片配图，保证同一张卡每帧都拿同一张图 */
export function pickCardImage(seed: number): string {
  const i = Math.abs(Math.floor(seed)) % CARD_IMAGES.length;
  return CARD_IMAGES[i];
}

/**
 * 把图片按「cover」方式画进给定矩形（不变形，裁切多余部分）。
 * 传 null 时退化成纯色块，不会崩。
 */
export function drawImageCover(
  g: CanvasRenderingContext2D,
  key: string,
  x: number,
  y: number,
  w: number,
  h: number,
  radiusPx = 0,
) {
  const img = getAsset(key);
  if (!img) {
    g.fillStyle = "rgba(120,130,145,0.35)";
    g.fillRect(x, y, w, h);
    return;
  }
  const ir = img.width / img.height;
  const rr2 = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (ir > rr2) {
    sw = img.height * rr2;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / rr2;
    sy = (img.height - sh) / 2;
  }
  g.save();
  if (radiusPx > 0) {
    g.beginPath();
    g.roundRect(x, y, w, h, radiusPx);
    g.clip();
  }
  g.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  g.restore();
}
