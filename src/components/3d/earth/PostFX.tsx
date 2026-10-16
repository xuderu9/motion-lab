/**
 * 后处理链
 *
 * Bloom 负责让大气辉光/城市灯光"发光"，
 * Vignette 压暗四角把视线收回中心，
 * 景深是可选项（会明显增加渲染时间）。
 *
 * 注意：不要在这里再做一次 ToneMapping —— R3F 的画布默认已经用
 * ACESFilmic 做过色调映射，叠加会导致画面发灰变平。
 */

import React from "react";
import { Bloom, DepthOfField, EffectComposer, Vignette } from "@react-three/postprocessing";

export interface PostFXProps {
  bloomIntensity?: number;
  /** 亮度阈值：低于它的像素不参与 Bloom，防止整体过曝 */
  bloomThreshold?: number;
  vignette?: number;
  enableDof?: boolean;
  focusDistance?: number;
  focalLength?: number;
  bokehScale?: number;
}

export const PostFX: React.FC<PostFXProps> = ({
  bloomIntensity = 0.85,
  bloomThreshold = 0.62,
  vignette = 0.55,
  enableDof = false,
  focusDistance = 0.012,
  focalLength = 0.05,
  bokehScale = 3,
}) => {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {enableDof ? (
        <DepthOfField
          focusDistance={focusDistance}
          focalLength={focalLength}
          bokehScale={bokehScale}
        />
      ) : (
        <></>
      )}
      <Bloom
        intensity={bloomIntensity}
        luminanceThreshold={bloomThreshold}
        luminanceSmoothing={0.28}
        mipmapBlur
      />
      <Vignette offset={0.28} darkness={vignette} />
    </EffectComposer>
  );
};
