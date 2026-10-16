/**
 * 游戏级地球场景
 *
 * 相对 Claw 原版的升级点：
 * - 材质：MeshBasicMaterial/纯色 → MeshStandardMaterial + 程序化 PBR 贴图
 *   （albedo / roughness / metalness / bump / clouds / night lights）
 * - 光照：2 盏灯 → 太阳主光 + 半球环境补光 + 背光轮廓 + 程序化环境贴图(PMREM)
 * - 大气：单个半透明球 → 菲涅尔散射双层辉光（受太阳方向调制）
 * - 新增：云层（受光、与地表不同速旋转）、夜间城市灯光、宇宙背景渐变
 * - 后处理：Bloom / Vignette /（可选）景深
 *
 * 确定性：所有动画只依赖 useCurrentFrame()，不依赖 useFrame 的 delta 累积，
 * 因此 Remotion 任意 seek 都会得到完全一致的画面。
 */

import React, { useMemo } from "react";
import { useCurrentFrame } from "remotion";
import { Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { createEarthTextures } from "./proceduralEarth";
import { PostFX } from "./PostFX";
import { Starfield } from "./Starfield";

// ============================================================================
// 大气散射 shader
// ============================================================================

const ATMOSPHERE_VERTEX = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying float vRho;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);

    // vRho = 该像素到「相机→行星中心」这条轴的垂直距离，
    // 以行星半径为单位。也就是说：vRho == 1.0 正好是行星轮廓线。
    // 有了它才能做「从轮廓线向外平滑衰减」的大气晕，
    // 而不是靠菲涅尔 —— 球壳的菲涅尔峰值永远出现在球壳自己的轮廓上，
    // 球壳撑得越大，那道"硬边光圈"越明显。
    vec3 center = modelMatrix[3].xyz;
    vec3 d = worldPosition.xyz - center;
    vec3 toCam = normalize(cameraPosition - center);
    float along = dot(d, toCam);
    vRho = sqrt(max(dot(d, d) - along * along, 0.0));

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const ATMOSPHERE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSunDir;
  uniform float uIntensity;
  /** 衰减曲线指数 */
  uniform float uPower;
  /** 内侧衰减宽度（行星半径为单位） */
  uniform float uInnerWidth;
  /** >0 时改用「从轮廓线向外衰减」的外晕模式 */
  uniform float uHalo;
  /** 球壳半径（= mesh 的 scale），外晕模式的衰减终点 */
  uniform float uShellRho;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying float vRho;

  void main() {
    // 径向剖面：两种模式都在 vRho == 1（行星轮廓）处达到峰值 1.0
    float prof;
    if (uHalo > 0.5) {
      prof = pow(clamp((uShellRho - vRho) / max(uShellRho - 1.0, 1e-4), 0.0, 1.0), uPower);
    } else {
      prof = pow(clamp(1.0 - abs(vRho - 1.0) / max(uInnerWidth, 1e-4), 0.0, 1.0), uPower);
    }
    if (prof <= 0.001) discard;

    // 球壳的法线就是从球心朝外的方向，直接拿来做光照朝向
    vec3 n = normalize(vWorldNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);

    // 向阳面亮、背阳面留一点点底光（避免夜侧轮廓彻底消失）
    float lit = smoothstep(-0.45, 0.75, dot(n, uSunDir));

    // 前向散射：视线接近太阳方向时出现一圈更亮的散射
    float forward = pow(max(dot(viewDir, -uSunDir), 0.0), 5.0);

    // 相加型发光 + toneMapped=false 意味着这里不会经过 ACES 兜底，
    // 系数一旦超过 1 就被削平成纯白，所以峰值压在 1 以内。
    vec3 color = uColor * uIntensity * prof * (0.12 + 0.88 * lit + 0.30 * forward * lit);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const BACKGROUND_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BACKGROUND_FRAGMENT = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform vec3 uAccent;
  varying vec3 vDir;

  void main() {
    float t = smoothstep(-0.7, 0.9, vDir.y);
    vec3 color = mix(uBottom, uTop, t);
    // 一点点星云感的斜向色偏，避免纯黑背景显得"平"
    float nebula = smoothstep(0.25, 1.0, vDir.x * 0.5 + vDir.z * 0.5 + 0.35);
    color += uAccent * nebula * 0.10;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const NIGHT_LIGHTS_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uSunDir;
  uniform float uIntensity;
  varying vec2 vUv;
  varying vec3 vWorldNormal;

  void main() {
    vec3 n = normalize(vWorldNormal);
    // 只在背光面点亮灯光
    float night = smoothstep(0.18, -0.28, dot(n, uSunDir));
    vec4 texel = texture2D(uMap, vUv);
    float mask = texel.r * night;
    gl_FragColor = vec4(texel.rgb * uIntensity * mask, mask);
  }
`;

const NIGHT_LIGHTS_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ============================================================================
// 类型
// ============================================================================

export type EarthQuality = "low" | "medium" | "high";

export interface EarthSceneProps {
  /** 每帧自转弧度 */
  rotationSpeed?: number;
  /** 地轴倾角（度） */
  axialTilt?: number;
  /** 太阳方向（世界坐标，会被归一化） */
  sunDirection?: [number, number, number];
  sunIntensity?: number;
  showAtmosphere?: boolean;
  showClouds?: boolean;
  showNightLights?: boolean;
  showStars?: boolean;
  showBackground?: boolean;
  quality?: EarthQuality;
  enablePostFx?: boolean;
  bloomIntensity?: number;
  /** Bloom 亮度阈值：低于它的像素不参与发光，防止整体过曝 */
  bloomThreshold?: number;
  vignette?: number;
  enableDof?: boolean;
}

interface QualityProfile {
  textureWidth: number;
  textureHeight: number;
  sphereSegments: number;
  envResolution: number;
  starCount: number;
}

const QUALITY: Record<EarthQuality, QualityProfile> = {
  low: { textureWidth: 512, textureHeight: 256, sphereSegments: 64, envResolution: 64, starCount: 2500 },
  medium: { textureWidth: 1024, textureHeight: 512, sphereSegments: 96, envResolution: 128, starCount: 5000 },
  high: { textureWidth: 2048, textureHeight: 1024, sphereSegments: 128, envResolution: 256, starCount: 9000 },
};

// ============================================================================
// 子组件
// ============================================================================

const BackgroundDome: React.FC = () => {
  const uniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color("#0a1424") },
      uBottom: { value: new THREE.Color("#000103") },
      uAccent: { value: new THREE.Color("#1b3459") },
    }),
    [],
  );

  return (
    <mesh renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[400, 32, 32]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={BACKGROUND_VERTEX}
        fragmentShader={BACKGROUND_FRAGMENT}
        side={THREE.BackSide}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
};

const Atmosphere: React.FC<{
  radius: number;
  sunDirection: THREE.Vector3;
  color: string;
  intensity: number;
  scale: number;
  power: number;
  /** 内侧衰减宽度（行星半径为单位），外晕模式忽略 */
  innerWidth?: number;
  /** true = 从轮廓线向外衰减的外晕；false = 贴着轮廓线的内缘 */
  halo?: boolean;
  side: THREE.Side;
  renderOrder: number;
}> = ({
  radius,
  sunDirection,
  color,
  intensity,
  scale,
  power,
  innerWidth = 0.11,
  halo = false,
  side,
  renderOrder,
}) => {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(color) },
      uSunDir: { value: sunDirection.clone() },
      uIntensity: { value: intensity },
      uPower: { value: power },
      uInnerWidth: { value: innerWidth },
      uHalo: { value: halo ? 1 : 0 },
      uShellRho: { value: radius * scale },
    }),
    [color, intensity, power, sunDirection, innerWidth, halo, radius, scale],
  );

  return (
    <mesh
      scale={radius * scale}
      renderOrder={renderOrder}
      /* 球壳自身不写深度，但仍参与深度测试：背面球壳会被行星本体挡掉，只留外圈 */
    >
      <sphereGeometry args={[1, 64, 64]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={ATMOSPHERE_VERTEX}
        fragmentShader={ATMOSPHERE_FRAGMENT}
        side={side}
        transparent
        depthTest
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
};

const NightLights: React.FC<{
  radius: number;
  lightsMap: THREE.Texture;
  sunDirection: THREE.Vector3;
  intensity: number;
}> = ({ radius, lightsMap, sunDirection, intensity }) => {
  const uniforms = useMemo(
    () => ({
      uMap: { value: lightsMap },
      uSunDir: { value: sunDirection.clone() },
      uIntensity: { value: intensity },
    }),
    [lightsMap, intensity, sunDirection],
  );

  return (
    <mesh scale={radius * 1.002} renderOrder={2}>
      <sphereGeometry args={[1, 96, 96]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={NIGHT_LIGHTS_VERTEX}
        fragmentShader={NIGHT_LIGHTS_FRAGMENT}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
};

/**
 * 程序化光照环境（PMREM）
 * 用 Lightformer 造出"太阳 + 天光 + 地面反照"的 HDR 环境，
 * 不下载任何 HDRI 文件，离线可用。
 */
const LightingRig: React.FC<{
  sunDirection: THREE.Vector3;
  sunIntensity: number;
  envResolution: number;
}> = ({ sunDirection, sunIntensity, envResolution }) => {
  const sunPosition = useMemo(
    () => sunDirection.clone().multiplyScalar(10),
    [sunDirection],
  );

  return (
    <>
      {/* 太阳：主光 + 唯一投影来源 */}
      <directionalLight
        position={sunPosition}
        intensity={sunIntensity}
        color="#fff5e6"
      />
      {/* 半球补光：天空冷蓝、地面近黑，让夜面不是死黑 */}
      <hemisphereLight args={["#7fa8ff", "#04070f", 0.07]} />
      {/* 背光轮廓：勾出球体边缘 */}
      <directionalLight
        position={sunDirection.clone().multiplyScalar(-12)}
        intensity={0.09}
        color="#2c5a9c"
      />

      <Environment resolution={envResolution} frames={1}>
        {/* 太阳（大面积整流器，给球面提供高光） */}
        <Lightformer
          form="rect"
          intensity={1.5}
          color="#fff2dc"
          position={sunPosition.clone().multiplyScalar(1.6)}
          scale={[12, 12, 1]}
          target={[0, 0, 0]}
        />
        {/* 冷色天光 */}
        <Lightformer
          form="rect"
          intensity={0.22}
          color="#9dc0ff"
          position={[0, 9, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[14, 14, 1]}
        />
        {/* 背面的微弱反射 */}
        <Lightformer
          form="rect"
          intensity={0.09}
          color="#3f6ea8"
          position={sunDirection.clone().multiplyScalar(-9)}
          scale={[10, 10, 1]}
          target={[0, 0, 0]}
        />
      </Environment>
    </>
  );
};

// ============================================================================
// 主组件
// ============================================================================

export const EarthScene: React.FC<EarthSceneProps> = ({
  rotationSpeed = 0.002,
  axialTilt = 23.44,
  // 侧逆光：让球面出现明显的明暗交界线（terminator），而不是正面平光
  sunDirection = [1, 0.28, 0.45],
  sunIntensity = 2.6,
  showAtmosphere = true,
  showClouds = true,
  showNightLights = true,
  showStars = true,
  showBackground = true,
  quality = "high",
  enablePostFx = true,
  bloomIntensity = 0.85,
  bloomThreshold,
  vignette = 0.55,
  enableDof = false,
}) => {
  const frame = useCurrentFrame();
  const profile = QUALITY[quality];

  const [sunX, sunY, sunZ] = sunDirection;
  const sunDir = useMemo(() => {
    // 用原始数字作为依赖，避免调用方每次传入新数组导致下游 useMemo 反复失效
    const v = new THREE.Vector3(sunX, sunY, sunZ);
    return v.lengthSq() === 0 ? new THREE.Vector3(1, 0, 0) : v.normalize();
  }, [sunX, sunY, sunZ]);

  const textures = useMemo(
    () =>
      createEarthTextures({
        width: profile.textureWidth,
        height: profile.textureHeight,
      }),
    [profile.textureWidth, profile.textureHeight],
  );

  // 确定性自转：直接由当前帧算出角度，不做累加
  const spin = frame * rotationSpeed;
  const cloudSpin = frame * rotationSpeed * 1.22;

  return (
    <>
      {showBackground && <BackgroundDome />}

      {showStars && (
        <Starfield
          radius={120}
          depth={70}
          count={profile.starCount}
          twinkleSpeed={0.3}
        />
      )}

      <LightingRig
        sunDirection={sunDir}
        sunIntensity={sunIntensity}
        envResolution={profile.envResolution}
      />

      {/* 地轴倾角作用在整个地球系统上 */}
      <group rotation={[0, 0, THREE.MathUtils.degToRad(axialTilt)]}>
        {/* 地表 */}
        <group rotation={[0, spin, 0]}>
          <mesh>
            <sphereGeometry args={[1, profile.sphereSegments, profile.sphereSegments]} />
            <meshStandardMaterial
              map={textures.albedo}
              roughnessMap={textures.roughness}
              metalnessMap={textures.metalness}
              bumpMap={textures.bump}
              bumpScale={0.035}
              // 贴图提供绝对值，这里用 1.0 做乘子
              roughness={1}
              metalness={1}
              envMapIntensity={1.15}
            />
          </mesh>

          {showNightLights && (
            <NightLights
              radius={1}
              lightsMap={textures.lights}
              sunDirection={sunDir}
              intensity={1.5}
            />
          )}
        </group>

        {/* 云层：比地表转得略快，制造视差 */}
        {showClouds && (
          <group rotation={[0, cloudSpin, 0]}>
            <mesh scale={1.012} renderOrder={1}>
              <sphereGeometry args={[1, profile.sphereSegments, profile.sphereSegments]} />
              <meshStandardMaterial
                alphaMap={textures.clouds}
                transparent
                color="#ffffff"
                roughness={0.85}
                metalness={0}
                depthWrite={false}
              />
            </mesh>
          </group>
        )}

        {showAtmosphere && (
          <>
            {/* 内层：贴着行星轮廓线、向内侧衰减的蓝色薄雾。
                注意 innerWidth 要给得足够宽（0.11 → 0.35）：
                径向剖面在 rho==1（行星轮廓）处天然取峰值，衰减带太窄的话
                就会在地球外面画出一个**边缘锐利的同心圆环**（像玻璃罩/呼啦圈），
                而不是"越往外越淡"的大气。宽 + 暗 才像霾。 */}
            <Atmosphere
              radius={1}
              sunDirection={sunDir}
              color="#7cc0ff"
              intensity={0.35}
              scale={1.015}
              power={3.0}
              innerWidth={0.35}
              side={THREE.FrontSide}
              renderOrder={3}
            />
            {/* 外层：从轮廓线向外一路衰减到壳边缘的大气晕。
                亮度由 vRho 决定（而不是球壳自身的菲涅尔），所以壳边缘没有硬边，
                可以放心撑到 1.16，让辉光真正溢到太空里 */}
            <Atmosphere
              radius={1}
              sunDirection={sunDir}
              color="#4f95e0"
              intensity={0.5}
              scale={1.20}
              power={2.0}
              halo
              side={THREE.BackSide}
              renderOrder={-1}
            />
          </>
        )}
      </group>

      {enablePostFx && (
        <PostFX
          bloomIntensity={bloomIntensity}
          bloomThreshold={bloomThreshold}
          vignette={vignette}
          enableDof={enableDof}
        />
      )}
    </>
  );
};
