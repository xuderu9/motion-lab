/**
 * 旋转地球（对外组件）
 *
 * 之前这里是 Claw 写的 MeshBasicMaterial + 单个半透明大气球版本。
 * 画面"平淡"的直接原因就是：纯色材质（没有 PBR）、只有 2 盏灯、完全没有后处理。
 *
 * 真正的实现现在放在 ./earth/EarthScene.tsx：
 * 程序化 PBR 贴图 + 多层光照 + 大气散射 + 云层 + 夜景灯光 + Bloom/Vignette。
 *
 * 这个文件保留原来的导入路径，避免其它模块跟着改。
 */

import React from "react";
import { EarthScene } from "./earth/EarthScene";
import type { EarthSceneProps } from "./earth/EarthScene";

export type RotatingEarthProps = EarthSceneProps;
export type { EarthQuality } from "./earth/EarthScene";

export const RotatingEarth: React.FC<RotatingEarthProps> = (props) => {
  return <EarthScene {...props} />;
};
