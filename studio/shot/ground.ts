// 带纹理的地面层（ground）—— 解决「纯色大面积区域」这个 hold3 根因。
//
// 实测依据（studio/MOTION-FINDINGS.md）：
//   空间镜头 active_frac 3.63%（比参考片还高），hold3 仍有 33.8%。
//   那 33.8% 是深色背景 + 暗角 —— **纯色**。相机平移一块纯色，等于什么都没发生。
//   => 任何大面积底色，必须带低对比度纹理，移动才有像素变化。
//
// 注意这不等于「呼吸感」：
//   呼吸 = 同一块颜色周期性明暗/缩放（全局同相位，3 秒尺度上仍算没变，且被明令禁止）
//   这里是**结构在空间上平移** —— 每块像素在几秒内都会被新纹理覆盖。
//
// 实现约束：
//   · 纹理只在模块初始化时生成一次（256×256 无缝），之后每帧只是 pattern + 偏移
//   · 全部确定性（整型哈希），Remotion 多进程并渲可复现
//   · 不依赖 document 之外的任何东西，也不依赖 t 的周期性

import type { Theme } from "./types";
import { clamp01 } from "./motion";

// ---------------------------------------------------------------------------
// 无缝值噪声
// ---------------------------------------------------------------------------

function h2(x: number, y: number, seed: number): number {
  let v = (x * 374761393 + y * 668265263 + seed * 1442695040888963407) | 0;
  v = (v ^ (v >>> 13)) * 1274126177;
  return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
}

/** 周期为 period 的平滑插值噪声（用于生成无缝贴图） */
function vnoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = (a: number, b: number) => h2(((a % period) + period) % period, ((b % period) + period) % period, seed);
  const a = w(xi, yi);
  const b = w(xi + 1, yi);
  const c = w(xi, yi + 1);
  const d = w(xi + 1, yi + 1);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}

const TILE = 256;
const cache = new Map<string, HTMLCanvasElement>();

/**
 * 生成（并缓存）一张无缝灰度贴图。值是 0..1 的噪声，**不是 alpha**。
 *
 * 为什么不用「白色 + alpha」：白纸上的白色半透明纹理，合成之后只差 0.4 个灰阶，
 * 既看不见、也过不了差分阈值（实测 hold3 一点没降）。必须真的改变亮度。
 * 所以改成灰度 + 混合模式：亮底 multiply、暗底 screen，都能拿到 ±10~15 灰阶。
 */
function paperTile(seed: number): HTMLCanvasElement | null {
  const key = `g${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === "undefined") return null;

  const cv = document.createElement("canvas");
  cv.width = TILE;
  cv.height = TILE;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(TILE, TILE);
  const d = img.data;

  // 各频率在贴图内的周期数（整数 => 无缝）
  const oct = [
    { p: 2, amp: 0.5 },
    { p: 5, amp: 0.32 },
    { p: 13, amp: 0.18 },
  ];

  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let v = 0;
      for (let k = 0; k < oct.length; k++) {
        const o = oct[k];
        const scale = o.p / TILE;
        v += vnoise(x * scale, y * scale, o.p, seed + k * 97) * o.amp;
      }
      const g = Math.round(clamp01((v - 0.2) * 1.45) * 255);
      const o4 = (y * TILE + x) * 4;
      d[o4] = g;
      d[o4 + 1] = g;
      d[o4 + 2] = g;
      d[o4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  cache.set(key, cv);
  return cv;
}

// ---------------------------------------------------------------------------
// 相机
// ---------------------------------------------------------------------------

export type GroundCam = { x: number; y: number; zoom: number };

/**
 * 地面相机：**速度全程不为 0，且不周期重复**。
 *
 * 用两个互质频率的正弦叠加，周期极长（>20 分钟），在本片长度内不会"看出来在循环"。
 * 速度下限由常数项保证 —— 不允许出现"停住"的时刻，否则那段 hold3 立刻抬起来。
 *
 * @param t    本地时间（秒）
 * @param seed 每个镜头不同，避免所有镜头的纹理走向一样
 */
export function groundCam(t: number, seed = 0): GroundCam {
  const px = 17 + (seed % 7) * 1.7;   // px/s，横向
  const py = 9 + (seed % 5) * 1.3;    // px/s，纵向
  const wob = 0.5;
  return {
    x: t * px + Math.sin(t * 0.19 + seed) * 26 * wob + Math.sin(t * 0.071 + seed * 2) * 12,
    y: t * py + Math.cos(t * 0.16 + seed) * 18 * wob,
    zoom: 1,
  };
}

// ---------------------------------------------------------------------------
// 绘制
// ---------------------------------------------------------------------------

export type GroundOpts = {
  /** 纹理强度 0..1；0.08~0.18 是"看得出是会动的纸但不脏"的区间 */
  strength?: number;
  seed?: number;
  /** 视差系数：远景 <1，近景 >1 */
  parallax?: number;
  /** 亮底用 multiply（压暗），暗底用 screen（提亮） */
  mode?: "multiply" | "screen";
};

/**
 * 在 (0,0,w,h) 上铺一层"会动的纸"。
 *
 * 关键：**真的改变亮度**，不是叠一层几乎透明的白。
 * 亮底用 multiply（把纸纹压暗 5~12%），暗底用 screen（提亮 3~8%）。
 * 这样纹理平移时每个像素会变 6~15 个灰阶 —— 足够过差分阈值，也足够看起来像纸。
 */
export function groundFill(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  o: GroundOpts = {},
) {
  const strength = o.strength ?? 0.12;
  const seed = (o.seed ?? 1) | 0;
  const tile = paperTile(seed);
  if (!tile) return;
  const pat = g.createPattern(tile, "repeat");
  if (!pat) return;

  const mode = o.mode ?? "multiply";
  const cam = groundCam(t, seed);
  const px = 1 / Math.max(0.2, o.parallax ?? 1);

  // 两层不同速度/尺度：近层快、远层慢，平铺的重复感也会被打散
  const layers = [
    { k: 1.0, sc: 1.0, a: 1.0 },
    { k: 1.9, sc: 1.63, a: 0.55 },
  ];
  g.save();
  g.globalCompositeOperation = mode;
  for (const L of layers) {
    const m = new DOMMatrix();
    m.a = L.sc;
    m.d = L.sc;
    m.e = -cam.x * px * L.k;
    m.f = -cam.y * px * L.k;
    pat.setTransform(m);
    g.globalAlpha = L.a * strength;
    g.fillStyle = pat;
    g.fillRect(0, 0, w, h);
  }
  g.restore();
}

/**
 * 完整的"地面"：主题底色渐变 + 会动的纸纹。
 * paperBg 的新实现就是调这个，所以 page / panel / mix 会**一起**获得大面积运动。
 */
export function groundPaper(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  colors: { top: string; bottom: string },
  o: GroundOpts = {},
) {
  const grd = g.createLinearGradient(0, 0, w * 0.35, h);
  grd.addColorStop(0, colors.top);
  grd.addColorStop(1, colors.bottom);
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  groundFill(g, w, h, t, o);
}

/** 给 theme 用的默认强度：亮底要更轻，否则显脏 */
export const groundStrength = (theme: Theme) => (theme.isLight ? 0.05 : 0.075);
