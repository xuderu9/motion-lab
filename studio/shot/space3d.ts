// space3d —— 在 canvas 2D 上做真正的透视投影。
//
// ═══ 为什么不用 WebGL ═══
// 用户反馈：「现在的版面有点像 PPT 那种看版型的动画，少了 3D」。
// 但「卡片在空间里飞过 / 悬浮」这类镜头，本质是**平面卡片在透视空间里运动**，
// 不需要光照材质。用 canvas 自己算投影有三个好处：
//   · 确定性：每帧只依赖 t，没有 GPU 状态，Remotion 逐帧渲染不会抖
//   · 快：一张卡一次 setTransform，几十张卡也不掉帧
//   · 能拼：和现有版式/块/CSS 层共存，不用另起一个 Composition
// 真需要实体（球体、雕塑）时再用 @remotion/three 另开一条路，两者不冲突。
//
// 数学模型：小孔成像。相机在原点朝 -Z 看，fov 决定焦距 f。
//   z  = 相机前方距离（>near 才可见）
//   sx = w/2 + (x * f) / z
//   sy = h/2 - (y * f) / z        （屏幕 y 向下，世界 y 向上）
//   scale = f / z                  （越远越小）
// 卡片的朝向用仿射近似：把卡片局部坐标的两个基向量分别投影，得到 2×2 矩阵。
// 对扁平卡片这个近似和真透视的差别肉眼看不出来，但便宜一个数量级。

export type Vec3 = { x: number; y: number; z: number };
export type Camera3D = {
  /** 画面宽高（像素） */
  w: number;
  h: number;
  /** 垂直视场角（弧度） */
  fov: number;
  /** 相机位置（朝 -Z 看） */
  pos: Vec3;
  /** 世界单位 → 像素的基准缩放 */
  unit: number;
};

export function makeCamera(w: number, h: number, fov = 0.72, pos: Vec3 = { x: 0, y: 0, z: 0 }): Camera3D {
  return { w, h, fov, pos, unit: 1 };
}

/** 焦距（像素） */
function focal(cam: Camera3D): number {
  return cam.h / 2 / Math.tan(cam.fov / 2);
}

export type Projected = { x: number; y: number; z: number; scale: number };

/** 世界点 → 屏幕点。z <= NEAR 时返回 null（在相机后面） */
export function project(cam: Camera3D, p: Vec3): Projected | null {
  const NEAR = 0.05;
  const r = { x: p.x - cam.pos.x, y: p.y - cam.pos.y, z: p.z - cam.pos.z };
  const depth = -r.z;
  if (depth <= NEAR) return null;
  const f = focal(cam);
  return {
    x: cam.w / 2 + (r.x * f) / depth,
    y: cam.h / 2 - (r.y * f) / depth,
    z: depth,
    scale: f / depth,
  };
}

/** 绕 X 轴旋转 */
function rotX(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
}
/** 绕 Y 轴旋转 */
function rotY(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
}
/** 绕 Z 轴旋转 */
function rotZ(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z };
}

export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** 光照方向（固定，相机系）：略左上偏前 */
const LIGHT = normalize({ x: -0.45, y: 0.62, z: 0.65 });

/**
 * 一张卡片在屏幕上的变换 + 明暗。
 *
 * 返回 null 表示在相机后面，调用方跳过即可。
 * 用法：
 *   const t3 = cardTransform(cam, pos, rx, ry, size)
 *   if (!t3) return
 *   g.save(); g.setTransform(t3.a, t3.b, t3.c, t3.d, t3.x, t3.y)
 *   // 此时在「卡片局部坐标」里画 0..size.w × 0..size.h
 *   ... ; g.restore()
 */
export function cardTransform(
  cam: Camera3D,
  pos: Vec3,
  rx: number,
  ry: number,
  size: { w: number; h: number },
  roll = 0,
): { x: number; y: number; a: number; b: number; c: number; d: number; depth: number; shade: number } | null {
  const c = project(cam, pos);
  if (!c) return null;
  const f = focal(cam);

  // 卡片局部基向量（未旋转 → 旋转 → 投影）
  const ex = rotY(rotX({ x: 1, y: 0, z: 0 }, rx), ry);
  // canvas 的 +y 向下，世界 +y 向上；这里取反，保证卡片里的文字是正的
  const ey = rotY(rotX({ x: 0, y: -1, z: 0 }, rx), ry);
  const nz = rotY(rotX({ x: 0, y: 0, z: 1 }, rx), ry);

  // 用「中心 + 基向量」投影出来的一阶差分近似雅可比
  const pEx = project(cam, { x: pos.x + ex.x, y: pos.y + ex.y, z: pos.z + ex.z });
  const pEy = project(cam, { x: pos.x + ey.x, y: pos.y + ey.y, z: pos.z + ey.z });
  if (!pEx || !pEy) return null;

  // 每世界单位对应的屏幕位移（再乘上卡片尺寸就得到整卡的仿射）
  let a = (pEx.x - c.x) / cam.unit;
  let b = (pEx.y - c.y) / cam.unit;
  let cc = (pEy.x - c.x) / cam.unit;
  let d = (pEy.y - c.y) / cam.unit;

  // roll（绕视线自转）
  if (roll !== 0) {
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const a2 = a * cr + cc * sr;
    const b2 = b * cr + d * sr;
    const c2 = -a * sr + cc * cr;
    const d2 = -b * sr + d * cr;
    a = a2; b = b2; cc = c2; d = d2;
  }

  // 明暗：法线与光的夹角
  const shade = 0.42 + 0.58 * Math.max(0, nz.x * LIGHT.x + nz.y * LIGHT.y + nz.z * LIGHT.z);
  void f;
  void size;
  return { x: c.x, y: c.y, a, b, c: cc, d, depth: c.z, shade };
}

/** 深度雾：越远越淡、越暗 */
export function fog(depth: number, near: number, far: number): number {
  const k = Math.max(0, Math.min(1, (depth - near) / Math.max(1e-6, far - near)));
  return 1 - 0.82 * k;
}

/** 把 3D 位置按深度排序（远的先画） */
export function sortByDepth<T extends { pos: Vec3 }>(items: T[]): T[] {
  return [...items].sort((p, q) => q.pos.z - p.pos.z);
}
