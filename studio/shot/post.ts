// 后期处理栈 —— 整屏质感的最后一层。
//
// 出处：`D:\DeepseekHarness\cankaoshipin\动效名称及描述.txt` 的「合成特效类」。
// 这里只放**不需要离屏缓冲**就能做对的效果：暗角、胶片颗粒、漏光、光晕、
// 遮幅、纸张噪点。全屏色差/故障撕裂需要拿到合成后的像素，属于 Film 层的事
// （见 studio/film/transitions.tsx）。
//
// 性能红线：这里的每一个效果都会被 5250 帧 × 并发 4~8 调用。
// 所以全部走「缓存纹理 + 一次 fill」，禁止逐像素 getImageData。

import { clamp01 } from "./motion";

// ---------------------------------------------------------------------------
// 环形缓冲：噪声贴图只需要生成一次，之后按纹理填充复用
// ---------------------------------------------------------------------------

type Tile = { cv: HTMLCanvasElement; pat: CanvasPattern | null; ctx: CanvasRenderingContext2D };
const TILES = new Map<string, Tile>();

function hash(x: number): number {
  let v = (x | 0) * 2246822519 + 374761393;
  v = (v ^ (v >>> 15)) * 3266489917;
  v = (v ^ (v >>> 13)) >>> 0;
  return v / 4294967296;
}

/**
 * 生成（并缓存）一张灰度噪声贴图。
 *
 * 用贴图而不是每帧 getImageData 的理由：1920×1080 的 ImageData 生成一次要
 * 30~60ms，5250 帧就是 5 分钟；而 256×256 的贴图是 1.3ms，还能当 pattern 平铺。
 */
function noiseTile(key: string, size: number, seed: number, mono: boolean): Tile | null {
  const hit = TILES.get(key);
  if (hit) return hit;
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0, n = size * size; i < n; i++) {
    const r = hash(seed + i * 2654435761);
    const v = r * 255;
    const o = i * 4;
    if (mono) {
      d[o] = v;
      d[o + 1] = v;
      d[o + 2] = v;
    } else {
      // 三通道独立：彩色噪声更像真实胶片的银盐颗粒
      d[o] = hash(seed + i * 97 + 1) * 255;
      d[o + 1] = hash(seed + i * 97 + 2) * 255;
      d[o + 2] = hash(seed + i * 97 + 3) * 255;
    }
    d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t: Tile = { cv, pat: null, ctx };
  TILES.set(key, t);
  return t;
}

// ---------------------------------------------------------------------------
// 暗角晕影
// ---------------------------------------------------------------------------

export type VignetteOpts = {
  /** 0~1，边缘压暗的强度 */
  strength?: number;
  /** 中心亮区半径（占画面短边比例） */
  inner?: number;
  /** 暗角颜色，默认黑；暖色调暗角用 rgba(40,20,10,…) */
  color?: string;
};

/**
 * 暗角。电影感的来源之一：它把观众视线压回画面中心。
 * 参考片的暗角极轻（几乎测不出来），所以默认值很保守。
 */
export function vignette(g: CanvasRenderingContext2D, W: number, H: number, o: VignetteOpts = {}) {
  const s = o.strength ?? 0.16;
  if (s <= 0.001) return;
  const inner = (o.inner ?? 0.46) * Math.min(W, H);
  const outer = Math.hypot(W, H) * 0.56;
  const grd = g.createRadialGradient(W / 2, H * 0.48, inner, W / 2, H * 0.5, outer);
  grd.addColorStop(0, "rgba(0,0,0,0)");
  grd.addColorStop(0.62, `rgba(0,0,0,${s * 0.35})`);
  grd.addColorStop(1, o.color ?? `rgba(0,0,0,${s})`);
  g.save();
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  g.restore();
}

// ---------------------------------------------------------------------------
// 胶片颗粒
// ---------------------------------------------------------------------------

export type GrainOpts = {
  /** 强度，0.02~0.05 是「有质感但不脏」的区间 */
  amount?: number;
  mono?: boolean;
  /** 贴图边长，256 够用 */
  cell?: number;
  /** 明暗混合：true 时用 overlay，颗粒会同时提亮和压暗（更像胶片） */
  overlay?: boolean;
};

/**
 * 胶片颗粒。
 *
 * 和「呼吸感」的区别必须写清楚：颗粒是**纹理**，逐帧随机、无周期、无方向，
 * 观众感知为「胶片/录屏质感」；呼吸是**周期性缩放或明暗摆动**，感知为「画面在喘」。
 * 前者是质感层，后者是被明令禁止的凑帧差手段。
 */
export function filmGrain(g: CanvasRenderingContext2D, W: number, H: number, frame: number, o: GrainOpts = {}) {
  const amount = o.amount ?? 0.035;
  if (amount <= 0.001) return;
  const cell = o.cell ?? 256;
  const t = noiseTile(`grain-${o.mono === false ? "c" : "m"}-${cell}`, cell, 1337, o.mono !== false);
  if (!t) return;
  if (!t.pat) t.pat = g.createPattern(t.cv, "repeat");
  if (!t.pat) return;

  // 每帧平移贴图原点：同一张图，不同相位，肉眼读作「新的颗粒」
  const ox = (frame * 37) % cell;
  const oy = (frame * 61) % cell;
  g.save();
  if (o.overlay !== false) g.globalCompositeOperation = "overlay";
  g.globalAlpha = amount;
  g.translate(-ox, -oy);
  g.fillStyle = t.pat;
  g.fillRect(0, 0, W + cell, H + cell);
  g.restore();
}

/**
 * 纸张噪点：给卡片/页面用的静态细纹。
 * 和时间无关 —— 纸不会动，动的是上面的东西。
 */
export function paperNoise(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  amount = 0.055,
  seed = 7,
) {
  if (amount <= 0.001) return;
  const t = noiseTile(`paper-${seed}`, 128, seed, true);
  if (!t) return;
  if (!t.pat) t.pat = g.createPattern(t.cv, "repeat");
  if (!t.pat) return;
  g.save();
  g.globalCompositeOperation = "overlay";
  g.globalAlpha = amount;
  g.fillStyle = t.pat;
  g.fillRect(x, y, w, h);
  g.restore();
}

// ---------------------------------------------------------------------------
// 漏光 / 光晕
// ---------------------------------------------------------------------------

export type LeakOpts = {
  /** 0~1，当前亮度 */
  intensity?: number;
  /** 光从哪个角来：0=左上 1=右上 2=右下 3=左下 (-1=不指定，用 u 扫过) */
  corner?: number;
  hue?: "warm" | "cool" | "magenta";
  /** 扫过的位置 0~1（corner=-1 时生效） */
  u?: number;
};

/**
 * 镜头漏光。模拟光线从镜头侧面漏进来 —— 复古电影最便宜的氛围层。
 * 用 screen 混合，只提亮不压暗，所以不会把画面弄脏。
 */
export function lightLeak(g: CanvasRenderingContext2D, W: number, H: number, o: LeakOpts = {}) {
  const a = o.intensity ?? 0;
  if (a <= 0.004) return;
  const hue = o.hue ?? "warm";
  const ramp =
    hue === "cool"
      ? ["rgba(0,0,0,0)", "rgba(110,170,255,1)", "rgba(220,240,255,1)", "rgba(0,0,0,0)"]
      : hue === "magenta"
        ? ["rgba(0,0,0,0)", "rgba(255,80,180,1)", "rgba(255,200,120,1)", "rgba(0,0,0,0)"]
        : ["rgba(0,0,0,0)", "rgba(255,120,40,1)", "rgba(255,215,140,1)", "rgba(0,0,0,0)"];

  let x0 = 0;
  let y0 = 0;
  let x1 = W;
  let y1 = H;
  const c = o.corner ?? -1;
  if (c === 0) { x0 = 0; y0 = 0; x1 = W * 0.72; y1 = H * 0.72; }
  else if (c === 1) { x0 = W; y0 = 0; x1 = W * 0.28; y1 = H * 0.72; }
  else if (c === 2) { x0 = W; y0 = H; x1 = W * 0.28; y1 = H * 0.28; }
  else if (c === 3) { x0 = 0; y0 = H; x1 = W * 0.72; y1 = H * 0.28; }
  else {
    const u = clamp01(o.u ?? 0.3);
    x0 = -W * 0.3 + u * W * 1.6;
    y0 = -H * 0.2 + u * H * 0.5;
    x1 = x0 + W * 0.75;
    y1 = y0 + H * 1.1;
  }

  const grd = g.createLinearGradient(x0, y0, x1, y1);
  grd.addColorStop(0, ramp[0]);
  grd.addColorStop(0.32, ramp[1]);
  grd.addColorStop(0.52, ramp[2]);
  grd.addColorStop(1, ramp[3]);
  g.save();
  g.globalCompositeOperation = "screen";
  g.globalAlpha = clamp01(a) * 0.55;
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  g.restore();
}

// ---------------------------------------------------------------------------
// 光斑 / 星芒
// ---------------------------------------------------------------------------

/**
 * 镜头光斑。一个亮点 + 一条过中心的横向光带 + 若干小圆斑。
 * 参数只给「光源在哪、多亮」，其余由确定性哈希生成，保证每帧一致。
 */
export function lensFlare(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  x: number,
  y: number,
  intensity = 0.4,
  seed = 3,
) {
  if (intensity <= 0.004) return;
  g.save();
  g.globalCompositeOperation = "screen";

  // 主光晕
  const core = Math.min(W, H) * 0.16 * (0.6 + intensity);
  const grd = g.createRadialGradient(x, y, 0, x, y, core);
  grd.addColorStop(0, `rgba(255,245,225,${0.55 * intensity})`);
  grd.addColorStop(0.25, `rgba(255,205,140,${0.24 * intensity})`);
  grd.addColorStop(1, "rgba(255,180,90,0)");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(x, y, core, 0, Math.PI * 2);
  g.fill();

  // 横贯的变形光带（anamorphic streak）
  const bw = W * 0.9;
  const bh = Math.max(1.5, H * 0.004);
  const sg = g.createLinearGradient(x - bw / 2, 0, x + bw / 2, 0);
  sg.addColorStop(0, "rgba(90,140,255,0)");
  sg.addColorStop(0.5, `rgba(150,190,255,${0.5 * intensity})`);
  sg.addColorStop(1, "rgba(90,140,255,0)");
  g.fillStyle = sg;
  g.fillRect(x - bw / 2, y - bh / 2, bw, bh);

  // 沿光线主轴的一串小光斑
  for (let i = 0; i < 5; i++) {
    const k = ((hash(seed + i) * 1.6 - 0.3) | 0) + i * 0.22;
    const px = x + (W / 2 - x) * k * 1.1;
    const py = y + (H / 2 - y) * k * 1.1;
    const r = Math.min(W, H) * (0.006 + hash(seed + i * 31) * 0.022);
    const a = intensity * (0.1 + hash(seed + i * 17) * 0.16);
    const pg = g.createRadialGradient(px, py, 0, px, py, r);
    pg.addColorStop(0, `rgba(200,220,255,${a})`);
    pg.addColorStop(1, "rgba(200,220,255,0)");
    g.fillStyle = pg;
    g.beginPath();
    g.arc(px, py, r, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// 遮幅 / 边框
// ---------------------------------------------------------------------------

/** 上下黑边。0.055 = 2.35:1 左右的电影遮幅，比全屏更「像片子」。 */
export function letterbox(g: CanvasRenderingContext2D, W: number, H: number, ratio = 0.055, color = "#05070b") {
  if (ratio <= 0) return;
  const bar = Math.round(H * ratio);
  g.save();
  g.fillStyle = color;
  g.fillRect(0, 0, W, bar);
  g.fillRect(0, H - bar, W, bar);
  g.restore();
}

/** 四角轻微压暗（比全屏暗角更克制，用在白底版面上） */
export function cornerShade(g: CanvasRenderingContext2D, W: number, H: number, strength = 0.06) {
  if (strength <= 0.001) return;
  const r = Math.hypot(W, H);
  for (const [cx, cy] of [
    [0, 0],
    [W, 0],
    [0, H],
    [W, H],
  ] as const) {
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r * 0.42);
    grd.addColorStop(0, `rgba(0,0,0,${strength})`);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.save();
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    g.restore();
  }
}

// ---------------------------------------------------------------------------
// 统一入口
// ---------------------------------------------------------------------------

export type PostOpts = {
  vignette?: VignetteOpts | false;
  grain?: GrainOpts | false;
  leak?: LeakOpts | false;
  flare?: { x: number; y: number; intensity: number; seed?: number } | false;
  letterbox?: number | false;
  corners?: number | false;
};

/**
 * 一个镜头末尾统一过一遍。
 * 顺序有讲究：先暗角（造型）→ 再光效（加光）→ 最后颗粒（压在一切之上，颗粒必须在最上，
 * 否则会显得「画面是干净的、脏东西浮在上面」）。
 */
export function postStack(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  frame: number,
  o: PostOpts = {},
) {
  if (o.vignette !== false) vignette(g, W, H, o.vignette ?? {});
  if (o.corners) cornerShade(g, W, H, typeof o.corners === "number" ? o.corners : 0.06);
  if (o.leak) lightLeak(g, W, H, o.leak);
  if (o.flare) lensFlare(g, W, H, o.flare.x, o.flare.y, o.flare.intensity, o.flare.seed ?? 3);
  if (o.letterbox) letterbox(g, W, H, typeof o.letterbox === "number" ? o.letterbox : 0.055);
  if (o.grain !== false) filmGrain(g, W, H, frame, o.grain ?? {});
}
