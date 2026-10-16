/**
 * 镜头运动（虚拟摄影机）
 *
 * Claw 原来的 VideoRenderer 把相机写死在 [0, 0, 5] / fov 50，
 * 于是 spec 里明明写了 "push-in"、"orbit"，渲染出来却始终是一个静止机位 ——
 * 这就是画面"平"的另一个重要原因：没有镜头语言。
 *
 * 这里把 spec 里的 camera.motion 真正实现出来。
 * 所有运动都由 useCurrentFrame() 推导，不使用 useFrame 的 delta 累加，
 * 因此 Remotion seek 到任意帧都得到同一条运动轨迹。
 */

import React, { useLayoutEffect } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

export type CameraMotionType =
  | "static"
  | "push-in"
  | "pull-out"
  | "pan-left"
  | "pan-right"
  | "orbit";

export interface CameraMotionConfig {
  type?: CameraMotionType;
  /** 运动持续秒数；<=0 或未填 = 占满整个镜头 */
  duration?: number;
  easing?: "spring" | "ease-in-out" | "linear";
}

export interface CameraRigProps {
  motion?: CameraMotionConfig;
  /** 镜头持续帧数 */
  shotDurationInFrames: number;
  /** 初始机位距离 */
  baseZ?: number;
  /** 垂直视场角 */
  fov?: number;
  /** 镜头看向的点 */
  target?: [number, number, number];
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 缓动函数：让运动有加减速，避免机械感 */
function ease(p: number, kind: CameraMotionConfig["easing"]): number {
  switch (kind) {
    case "linear":
      return p;
    case "spring": {
      // 轻微回弹，收尾更有"重量感"
      const c = 2 * Math.PI / 2.6;
      return p >= 1 ? 1 : 1 - Math.pow(2, -9 * p) * Math.cos(c * p);
    }
    case "ease-in-out":
    default:
      return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  }
}

export const CameraRig: React.FC<CameraRigProps> = ({
  motion,
  shotDurationInFrames,
  baseZ = 4.6,
  fov = 40,
  target = [0, 0, 0],
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const camera = useThree((state) => state.camera);

  const type = motion?.type ?? "static";
  const durationInFrames =
    motion?.duration && motion.duration > 0
      ? Math.round(motion.duration * fps)
      : shotDurationInFrames;
  const [tx, ty, tz] = target;
  const easingKind = motion?.easing ?? "ease-in-out";

  // 用 layoutEffect 在提交阶段直接改相机，避免闪烁
  useLayoutEffect(() => {
    const raw = clamp01(frame / Math.max(1, durationInFrames));
    const p = ease(raw, easingKind);

    let z = baseZ;
    let y = 0;
    let azimuth = 0;
    let targetFov = fov;

    switch (type) {
      case "push-in":
        // 推镜：同时略收视角，产生轻微的"变焦压缩"感
        z = baseZ * (1 - 0.26 * p);
        targetFov = fov * (1 - 0.06 * p);
        break;
      case "pull-out":
        z = baseZ * (1 + 0.34 * p);
        targetFov = fov * (1 + 0.05 * p);
        break;
      case "pan-left":
        azimuth = THREE.MathUtils.degToRad(-14 * p);
        break;
      case "pan-right":
        azimuth = THREE.MathUtils.degToRad(14 * p);
        break;
      case "orbit":
        // 环绕：水平 ±18°，并轻微抬高机位
        azimuth = THREE.MathUtils.degToRad(-18 + 36 * p);
        y = 0.32 * Math.sin(p * Math.PI);
        break;
      case "static":
      default:
        break;
    }

    camera.position.set(Math.sin(azimuth) * z, y, Math.cos(azimuth) * z);
    camera.lookAt(tx, ty, tz);

    if (camera instanceof THREE.PerspectiveCamera) {
      if (camera.fov !== targetFov) {
        camera.fov = targetFov;
        camera.updateProjectionMatrix();
      }
    }
    camera.updateMatrixWorld();
  }, [camera, frame, durationInFrames, type, baseZ, fov, easingKind, tx, ty, tz]);

  return null;
};
