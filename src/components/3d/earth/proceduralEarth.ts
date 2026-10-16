/**
 * 程序化地球贴图（PBR）
 *
 * 设计要点：
 * 1. 完全确定性 —— 用 mulberry32 + 值噪声，绝不使用 Math.random，
 *    保证 Remotion 每次 seek 到同一帧都渲染出完全一样的像素。
 * 2. 不依赖任何远程素材（不下载 NASA 贴图、不拉 CDN HDRI），
 *    贴图全部在本地按噪声生成，可离线渲染、无版权问题。
 * 3. 一次遍历同时算出 albedo / roughness / metalness / bump / clouds / night lights，
 *    避免 6 张贴图各扫一遍像素。
 * 4. 结果按参数缓存，同一个渲染进程内只生成一次。
 */

import * as THREE from "three";

// ============================================================================
// 确定性随机 + 噪声
// ============================================================================

/** mulberry32：小而快的确定性 PRNG */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Noise3D = (x: number, y: number, z: number) => number;

/** 3D 值噪声（三维采样 → 球面上天然无缝，不会出现经度接缝） */
function createValueNoise3D(seed: number): Noise3D {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];

  const lattice = (ix: number, iy: number, iz: number): number =>
    p[(p[(p[ix & 255] + iy) & 255] + iz) & 255] / 255;

  return (x, y, z) => {
    const xf = Math.floor(x);
    const yf = Math.floor(y);
    const zf = Math.floor(z);
    const fx = x - xf;
    const fy = y - yf;
    const fz = z - zf;
    // smoothstep 插值，避免方块状伪影
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const uz = fz * fz * (3 - 2 * fz);

    const c000 = lattice(xf, yf, zf);
    const c100 = lattice(xf + 1, yf, zf);
    const c010 = lattice(xf, yf + 1, zf);
    const c110 = lattice(xf + 1, yf + 1, zf);
    const c001 = lattice(xf, yf, zf + 1);
    const c101 = lattice(xf + 1, yf, zf + 1);
    const c011 = lattice(xf, yf + 1, zf + 1);
    const c111 = lattice(xf + 1, yf + 1, zf + 1);

    const x00 = c000 + (c100 - c000) * ux;
    const x10 = c010 + (c110 - c010) * ux;
    const x01 = c001 + (c101 - c001) * ux;
    const x11 = c011 + (c111 - c011) * ux;
    const y0 = x00 + (x10 - x00) * uy;
    const y1 = x01 + (x11 - x01) * uy;
    return y0 + (y1 - y0) * uz;
  };
}

type Fbm3D = (x: number, y: number, z: number) => number;

/** 分形布朗运动：把多倍频噪声叠加成自然的大陆/云层形态 */
function createFbm(noise: Noise3D, octaves: number, lacunarity = 2, gain = 0.5): Fbm3D {
  let amp = 1;
  let norm = 0;
  let freq = 1;
  const amps: number[] = [];
  const freqs: number[] = [];
  for (let i = 0; i < octaves; i++) {
    amps.push(amp);
    freqs.push(freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return (x, y, z) => {
    let sum = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amps[i] * noise(x * freqs[i], y * freqs[i], z * freqs[i]);
    }
    return sum / norm;
  };
}

/** 山脊噪声：给山脉做出尖锐的脊线 */
function createRidged(noise: Noise3D, octaves: number): Fbm3D {
  const fbm = createFbm(noise, octaves, 2, 0.5);
  return (x, y, z) => 1 - Math.abs(fbm(x, y, z) * 2 - 1);
}

// ============================================================================
// 小工具
// ============================================================================

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

type RGB = [number, number, number];

/** 按温度/纬度混色的小调色板 */
function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

// ============================================================================
// 调色板
// ============================================================================

const OCEAN_DEEP: RGB = [6, 22, 48];
const OCEAN_MID: RGB = [12, 48, 86];
const OCEAN_SHALLOW: RGB = [30, 104, 148];
const COAST: RGB = [72, 152, 176];
const BEACH: RGB = [186, 170, 128];
const DESERT: RGB = [168, 140, 92];
const TROPICAL: RGB = [34, 88, 46];
const TEMPERATE: RGB = [58, 98, 56];
const BOREAL: RGB = [38, 66, 46];
const ROCK: RGB = [104, 100, 92];
const SNOW: RGB = [236, 242, 248];

export interface EarthTextureOptions {
  /** 贴图宽度，必须为 2 的幂（默认 1024） */
  width?: number;
  /** 贴图高度，必须为 2 的幂（默认 512） */
  height?: number;
  /** 噪声种子 */
  seed?: number;
  /** 海平面（0-1，默认 0.5）。调高 = 海洋更多 */
  seaLevel?: number;
  /** 各向异性过滤等级 */
  anisotropy?: number;
}

export interface EarthTextures {
  albedo: THREE.DataTexture;
  roughness: THREE.DataTexture;
  metalness: THREE.DataTexture;
  bump: THREE.DataTexture;
  clouds: THREE.DataTexture;
  lights: THREE.DataTexture;
}

const textureCache = new Map<string, EarthTextures>();

function makeTexture(
  data: Uint8Array,
  width: number,
  height: number,
  colorSpace: THREE.ColorSpace,
  anisotropy: number,
): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  tex.colorSpace = colorSpace;
  tex.wrapS = THREE.RepeatWrapping; // 经度方向环绕
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 生成一整套地球 PBR 贴图。
 *
 * 输出全部是 equirectangular（经纬展开）UV 的贴图，
 * 因此必须贴在 sphereGeometry 上（sphere 的 uv 就是 equirect）。
 */
export function createEarthTextures(options: EarthTextureOptions = {}): EarthTextures {
  const width = options.width ?? 1024;
  const height = options.height ?? 512;
  const seed = options.seed ?? 20261016;
  const seaLevel = options.seaLevel ?? 0.5;
  const anisotropy = options.anisotropy ?? 8;

  const key = `${width}x${height}:${seed}:${seaLevel}:${anisotropy}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  // ---- 噪声场 ----
  const continents = createFbm(createValueNoise3D(seed), 6);
  const detail = createFbm(createValueNoise3D(seed + 101), 6);
  const ridges = createRidged(createValueNoise3D(seed + 202), 4);
  const climate = createFbm(createValueNoise3D(seed + 303), 3);
  const cloudNoise = createFbm(createValueNoise3D(seed + 404), 5);
  const cityNoise = createValueNoise3D(seed + 505);

  const pixels = width * height;
  const albedoData = new Uint8Array(pixels * 4);
  const roughData = new Uint8Array(pixels * 4);
  const metalData = new Uint8Array(pixels * 4);
  const bumpData = new Uint8Array(pixels * 4);
  const cloudData = new Uint8Array(pixels * 4);
  const lightData = new Uint8Array(pixels * 4);

  const setPx = (arr: Uint8Array, i: number, r: number, g: number, b: number, a = 255): void => {
    const o = i * 4;
    arr[o] = r;
    arr[o + 1] = g;
    arr[o + 2] = b;
    arr[o + 3] = a;
  };

  for (let y = 0; y < height; y++) {
    // v=0 → 北极，v=1 → 南极
    const v = (y + 0.5) / height;
    const lat = (0.5 - v) * Math.PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    const absLat = Math.abs(lat) / (Math.PI / 2); // 0 赤道 → 1 极点

    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const lon = u * Math.PI * 2;

      // 球面单位向量：三维噪声采样 → 无接缝
      const sx = cosLat * Math.cos(lon);
      const sy = sinLat;
      const sz = cosLat * Math.sin(lon);

      // ---- 高程 ----
      const continent = continents(sx * 1.7, sy * 1.7, sz * 1.7);
      const fine = detail(sx * 6.5, sy * 6.5, sz * 6.5);
      const ridge = ridges(sx * 4.2, sy * 4.2, sz * 4.2);

      // 大陆抬高、山脊叠加
      const elevation = continent * 0.78 + fine * 0.14 + ridge * 0.08;
      const aboveSea = elevation - seaLevel;
      const isLand = aboveSea > 0;

      // ---- 气候（温度 + 干燥度）----
      const climateN = climate(sx * 2.1, sy * 2.1, sz * 2.1);
      // 纬度决定基础温度：赤道热、两极冷
      const temp = clamp01(1 - absLat * 1.25 + (climateN - 0.5) * 0.35);
      const humidity = clamp01(climateN * 1.15 - absLat * 0.25);

      const i = y * width + x;

      if (!isLand) {
        // ---------- 海洋 ----------
        const depth = clamp01(-aboveSea / seaLevel);
        let color = mixRgb(OCEAN_SHALLOW, OCEAN_MID, smoothstep(0, 0.35, depth));
        color = mixRgb(color, OCEAN_DEEP, smoothstep(0.3, 1, depth));
        // 近岸带
        const shore = smoothstep(0.985, 1, 1 - depth * 4.6);
        color = mixRgb(color, COAST, shore * 0.55);

        setPx(albedoData, i, color[0], color[1], color[2]);
        // 海面平滑 → 低粗糙度才有太阳高光；
        // 但不能太低：0.16 时太阳直射高光会削平成纯白并撑出一圈巨大 Bloom，
        // 所以取 0.30 起步 —— 高光仍然明显，峰值却落回可调区间。
        const rough = mix(0.3, 0.46, depth);
        setPx(roughData, i, rough * 255, rough * 255, rough * 255);
        // 轻微金属度让海面反光更"镜面"
        setPx(metalData, i, 26, 26, 26);
        setPx(bumpData, i, 128, 128, 128);
      } else {
        // ---------- 陆地 ----------
        const h = clamp01(aboveSea / (1 - seaLevel)); // 0 海岸 → 1 最高
        const mountain = smoothstep(0.45, 0.95, h * (0.55 + ridge * 0.75));

        // 生物群系：热带 → 温带 → 寒带，湿度决定沙漠/森林
        let base = mixRgb(DESERT, TROPICAL, smoothstep(0.1, 0.55, humidity));
        if (temp < 0.62) base = mixRgb(base, TEMPERATE, smoothstep(0.62, 0.45, temp));
        if (temp < 0.34) base = mixRgb(base, BOREAL, smoothstep(0.34, 0.16, temp));
        // 海岸沙地：只在干旱气候出现，且过渡带很窄。
        // 原来这里用 smoothstep(0, 0.045, h) 在 h≈0 处直接给出纯米色，
        // 结果在**每一条海岸线**上画出一道米黄色硬描边，整块大陆看起来
        // 像贴纸剪下来贴上去的。
        const sand = (1 - humidity) * smoothstep(0.0, 0.02, h);
        base = mixRgb(base, BEACH, sand * 0.35);
        // 高海拔岩石
        base = mixRgb(base, ROCK, mountain * 0.8);
        // 雪线：高纬或高海拔
        const snowLine = clamp01(smoothstep(0.72, 0.95, absLat) + smoothstep(0.62, 0.9, h) * (1 - temp));
        base = mixRgb(base, SNOW, snowLine);

        setPx(albedoData, i, base[0], base[1], base[2]);

        const rough = clamp01(mix(0.92, 0.62, snowLine) - mountain * 0.08);
        setPx(roughData, i, rough * 255, rough * 255, rough * 255);
        setPx(metalData, i, 0, 0, 0);

        // 高度场 → bumpMap（细节起伏 + 山脉）
        const bump = clamp01(h * 0.55 + ridge * 0.3 + fine * 0.15);
        setPx(bumpData, i, bump * 255, bump * 255, bump * 255);
      }

      // ---------- 云层 ----------
      // 用不同尺度的 fbm 做团块状云，再按纬气压带调制（副热带少云）
      const c1 = cloudNoise(sx * 2.6, sy * 2.6, sz * 2.6);
      const c2 = cloudNoise(sx * 7.0 + 11, sy * 7.0, sz * 7.0);
      const band = 0.55 + 0.45 * Math.cos(absLat * Math.PI * 3.1);
      const cloud = smoothstep(0.5, 0.78, c1 * 0.72 + c2 * 0.28 + (band - 0.55) * 0.18);
      const cloudA = clamp01(cloud * band * 1.15);
      // 注意：three.js 的 alphaMap 采样的是 **绿色通道**（不是 alpha 通道）。
      // 之前这里把覆盖率写进 alpha、RGB 全填 255，等于云层永远不透明，
      // 整个地球被糊成一团白球 —— 这是"过曝"观感的主要来源。
      const cloudByte = cloudA * 255;
      setPx(cloudData, i, cloudByte, cloudByte, cloudByte);

      // ---------- 夜间灯光 ----------
      // 只出现在陆地、避开极地冰盖；海岸线附近更密（人口聚集）
      if (isLand) {
        const pop = cityNoise(sx * 42, sy * 42, sz * 42);
        const pop2 = cityNoise(sx * 96 + 7, sy * 96, sz * 96);
        const coastBias = 1 - smoothstep(0.02, 0.28, clamp01(aboveSea / (1 - seaLevel)));
        const iceMask = 1 - smoothstep(0.66, 0.86, absLat);
        const dots = smoothstep(0.62, 0.86, pop * 0.6 + pop2 * 0.4);
        const intensity = clamp01(dots * (0.45 + coastBias * 0.75) * iceMask * (0.35 + humidity * 0.8));
        const warm = mix(0.72, 1, pop2); // 略微冷暖不一的灯光
        setPx(
          lightData,
          i,
          intensity * 255 * warm,
          intensity * 255 * mix(0.78, 0.95, warm),
          intensity * 255 * mix(0.45, 0.7, warm),
        );
      } else {
        setPx(lightData, i, 0, 0, 0);
      }
    }
  }

  const result: EarthTextures = {
    albedo: makeTexture(albedoData, width, height, THREE.SRGBColorSpace, anisotropy),
    roughness: makeTexture(roughData, width, height, THREE.NoColorSpace, anisotropy),
    metalness: makeTexture(metalData, width, height, THREE.NoColorSpace, anisotropy),
    bump: makeTexture(bumpData, width, height, THREE.NoColorSpace, anisotropy),
    clouds: makeTexture(cloudData, width, height, THREE.NoColorSpace, anisotropy),
    lights: makeTexture(lightData, width, height, THREE.NoColorSpace, anisotropy),
  };

  textureCache.set(key, result);
  return result;
}
