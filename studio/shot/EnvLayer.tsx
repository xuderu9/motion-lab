// 环境层：即梦背景板（静帧）。
//
// 相机锁死、环境不动 → 背景板用静帧就够，3D 渲染成本归零（HANDOFF §4.5）。
// M6 的烘焙点也在这里：将来整层可以被预合成为 PNG 序列/单帧。
//
// exposure 是亮度账的唯一旋钮：屏幕只占全帧 9.38%，屏内已经 235.8 到顶，
// 所以整片亮度的缺口只能从房间补（详见 M1-DESIGN §5）。

import React from "react";
import { Img, staticFile, useVideoConfig } from "remotion";
import type { EnvSpec } from "./types";
import { resolveEnv } from "./types";

export const EnvLayer: React.FC<{ env: EnvSpec }> = ({ env }) => {
  const { width, height } = useVideoConfig();
  const { exposure } = resolveEnv(env);
  return (
    <Img
      src={staticFile(env.src)}
      style={{
        position: "absolute",
        inset: 0,
        width,
        height,
        objectFit: "cover",
        filter: exposure === 1 ? undefined : `brightness(${exposure})`,
      }}
    />
  );
};
