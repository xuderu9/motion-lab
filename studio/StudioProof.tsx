// 技术验证：写实环境层（3D）+ 扁平内容层（DOM/矢量）分层合成
//
// 要证明的三件事：
//   1. 一次渲染出来的写实环境（HDRI + PBR + 景深 + Bloom）能到什么质感
//   2. 相机锁死、环境静止，只让屏幕内容动 —— 渲染预算几乎不涨
//   3. 扁平矢量文字层压上去之后，两层能不能共存成一个画面
//
// 渲染：
//   npx remotion render studio/index.ts StudioProof out/studio-proof.mp4
// 单帧：
//   npx remotion still studio/index.ts StudioProof out/studio-still.png --frame=300
// 排障用最小复现：
//   npx remotion still studio/index.ts MinTest out/min-test.png --frame=10

import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AbsoluteFill,
  Composition,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  Noise,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import { Room, drawScreenUI } from "./Room";

const W = 1024;
const H = 640;

/** 关掉后处理，看原始场景 */
const FX = true;
/** 拉远看整个布景 */
const WIDE = false;
/** 黏土渲染：只照几何布局 */
const CLAY = false;
/** 把 HDRI 当天空盒显示，确认贴图加载 */
const SHOW_ENV_BG = false;

/**
 * 相机必须显式 lookAt（R3F 覆盖 position 时不会自动对准原点）。
 *
 * 【必须用 useLayoutEffect，不能用 useEffect】
 * Remotion 的截图发生在 paint 之后、useEffect 之前，用 useEffect 设相机会导致
 * 首帧拿到的是 R3F 默认相机 (0,0,5) fov 75 —— 画面偏小、位置全错。
 *
 * 【不要同时给 <ThreeCanvas> 传 camera prop】
 * 传了的话 R3F 会在后续渲染里重新应用它，把这里设的值覆盖掉。
 */
const CameraRig: React.FC = () => {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(WIDE ? 0 : 0.06, WIDE ? 2.55 : 1.52, WIDE ? 5.2 : 2.82);
    camera.lookAt(0, WIDE ? 1.0 : 1.06, WIDE ? 0 : -0.18);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = WIDE ? 40 : 34;
      camera.near = 0.1;
      camera.far = 30;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld(true);
  }, [camera]);
  return null;
};

const Stage: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // ---- HDRI：用 delayRender 保证首帧之前一定加载完 ----
  const [envMap, setEnvMap] = useState<THREE.Texture | null>(null);
  const [handle] = useState(() => delayRender("load hdri"));
  useLayoutEffect(() => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        continueRender(handle);
      }
    };
    new RGBELoader().load(
      staticFile("hdri/satara_night.hdr"),
      (tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        setEnvMap(tex);
        finish();
      },
      undefined,
      (err) => {
        console.error("HDRI 加载失败", err);
        finish();
      },
    );
    const t = setTimeout(finish, 8000);
    return () => clearTimeout(t);
  }, [handle]);

  // ---- 屏幕贴图：每帧重绘到 canvas ----
  const canvas = useMemo(() => {
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    return cv;
  }, []);
  const screenTex = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [canvas]);

  const prev = useRef(-1);
  if (prev.current !== frame) {
    prev.current = frame;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const sec = frame / fps;
      const count = Math.round(
        interpolate(sec, [2.4, 9.0], [0, 8120], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: (v) => 1 - Math.pow(1 - v, 3),
        }),
      );
      drawScreenUI(ctx, W, H, {
        t: sec,
        count,
        ring: interpolate(sec, [2.0, 30], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        reveal: interpolate(sec, [1.0, 4.2], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        bars: [0, 1, 2, 3, 4, 5].map((i) =>
          interpolate(
            sec,
            [3.0 + i * 0.35, 4.6 + i * 0.35],
            [0, [0.35, 0.62, 0.48, 0.85, 0.55, 0.72][i]],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: (v) => 1 - Math.pow(1 - v, 3),
            },
          ),
        ),
      });
      screenTex.needsUpdate = true;
    }
  }

  // ---- 扁平矢量覆盖层（第三幕）----
  const overlayIn = interpolate(frame, [17.5 * fps, 19.5 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (v) => 1 - Math.pow(1 - v, 3),
  });
  const scrim = interpolate(frame, [17.5 * fps, 20 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeIn = interpolate(frame, [0, 1.2 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const lines = [
    "环境层：HDRI 环境光 · PBR 材质 · 景深 · Bloom",
    "相机锁死 —— 与参考片实测一致（355/360 帧位移为 0）",
    "只有屏幕内容在动；扁平矢量层叠在最上面",
  ];

  return (
    <AbsoluteFill style={{ background: "#05080d" }}>
      <AbsoluteFill style={{ opacity: fadeIn }}>
        <ThreeCanvas width={width} height={height} gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}>
          <CameraRig />
          <Room envMap={envMap} screenTex={screenTex} showEnvBackground={SHOW_ENV_BG} clay={CLAY} />
          {FX ? (
            <EffectComposer>
              <DepthOfField target={[0, 0.9, 0.06]} focalLength={0.055} bokehScale={3.6} height={720} />
              <Bloom intensity={0.5} luminanceThreshold={0.68} luminanceSmoothing={0.3} mipmapBlur />
              <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
              <Vignette offset={0.32} darkness={0.58} blendFunction={BlendFunction.NORMAL} />
              <Noise opacity={0.03} premultiply blendFunction={BlendFunction.OVERLAY} />
            </EffectComposer>
          ) : null}
        </ThreeCanvas>
      </AbsoluteFill>

      {/* 扁平矢量层：证明两层可以共存 */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(to top, rgba(4,7,12,${0.72 * scrim}) 0%, rgba(4,7,12,${0.34 * scrim}) 26%, rgba(4,7,12,0) 46%)`,
          opacity: overlayIn,
        }}
      />
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          padding: "0 96px 84px",
          fontFamily: "'Microsoft YaHei', system-ui, sans-serif",
          pointerEvents: "none",
        }}
      >
        <div style={{ opacity: overlayIn }}>
          <div
            style={{
              display: "inline-block",
              padding: "5px 14px",
              borderRadius: 999,
              background: "rgba(45,108,246,0.22)",
              border: "1px solid rgba(90,150,255,0.4)",
              color: "#9dc0ff",
              fontSize: 15,
              letterSpacing: 1.6,
              marginBottom: 18,
            }}
          >
            STUDIO PROOF · 虚拟摄影棚
          </div>
          <div
            style={{
              color: "#f2f5f9",
              fontSize: 54,
              fontWeight: 700,
              letterSpacing: 0.5,
              marginBottom: 22,
              transform: `translateY(${(1 - overlayIn) * 18}px)`,
            }}
          >
            写实环境 + 扁平内容，是两层
          </div>
          {lines.map((l, i) => {
            const a = interpolate(
              frame,
              [(19 + i * 0.9) * fps, (20.4 + i * 0.9) * fps],
              [0, 1],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: (v) => 1 - Math.pow(1 - v, 3),
              },
            );
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  opacity: a,
                  transform: `translateX(${(1 - a) * -14}px)`,
                  marginBottom: 12,
                }}
              >
                <div style={{ width: 7, height: 7, borderRadius: 4, background: "#37d6a8" }} />
                <span style={{ color: "rgba(226,236,248,0.92)", fontSize: 23 }}>{l}</span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          left: 28,
          bottom: 22,
          color: "rgba(180,200,225,0.42)",
          fontSize: 14,
          fontFamily: "ui-monospace, Consolas, monospace",
          opacity: interpolate(frame, [0.5 * fps, 2 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        1080p30 · 相机锁定 · 环境静态 · 仅屏幕内容运动
      </div>
    </AbsoluteFill>
  );
};

export const StudioRoot: React.FC = () => (
  <>
    <Composition id="StudioProof" component={Stage} durationInFrames={900} fps={30} width={1920} height={1080} />
    <Composition id="MinTest" component={MinTest} durationInFrames={30} fps={30} width={1920} height={1080} />
  </>
);

/**
 * 最小复现：居中的 1×1×1 立方体，相机 (0,0,5) fov 50。
 * 预期：立方体约占 258×258 px、中心在 (960,540)；上半浅蓝 / 下半浅绿在中线相接。
 * 这三条同时成立，才说明 Remotion → R3F 的相机与视口是可信的。
 */
const MinTest: React.FC = () => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: "#101010" }}>
      <ThreeCanvas width={width} height={height}>
        <CameraProbe />
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#ff3366" />
        </mesh>
        <mesh position={[0, 3, -4]}>
          <planeGeometry args={[30, 6]} />
          <meshBasicMaterial color="#7fd4ff" />
        </mesh>
        <mesh position={[0, -3, -4]}>
          <planeGeometry args={[30, 6]} />
          <meshBasicMaterial color="#7fff9f" />
        </mesh>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};

const CameraProbe: React.FC = () => {
  const { camera, size, viewport } = useThree();
  const [handle] = useState(() => delayRender("min-probe"));
  useLayoutEffect(() => {
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = 50;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld(true);
    const tl = new THREE.Vector3(-0.5, 0.5, 0.5).project(camera);
    const br = new THREE.Vector3(0.5, -0.5, 0.5).project(camera);
    const px = (v: THREE.Vector3) =>
      `(${Math.round(((v.x + 1) / 2) * size.width)},${Math.round(((1 - v.y) / 2) * size.height)})`;
    console.log(
      `MINPROBE r3fSize=${size.width}x${size.height} viewport=${viewport.width.toFixed(1)}x${viewport.height.toFixed(1)} ` +
        `camAspect=${(camera as THREE.PerspectiveCamera).aspect.toFixed(3)} ` +
        `boxTopLeft=${px(tl)} boxBotRight=${px(br)}`,
    );
    continueRender(handle);
  }, [camera, handle, size, viewport]);
  return null;
};
