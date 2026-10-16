/**
 * 视频渲染器
 * 
 * 根据 VideoSpec 渲染场景
 */

import React from "react";
import { Sequence, AbsoluteFill, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { VideoSpecSchema } from "./schema/video-spec";
import type { VideoSpec, VideoSpecInput, Shot, Element } from "./schema/video-spec";

// 导入组件
import { RotatingEarth } from "./components/3d/RotatingEarth";
import { CameraRig } from "./components/3d/earth/CameraRig";
import { CardStack3D } from "./components/3d/CardStack3D";
import type { CameraMotionConfig } from "./components/3d/earth/CameraRig";
import { SmoothLineChart } from "./components/charts/SmoothLineChart";
import { BarChart } from "./components/charts/BarChart";
import { ComparisonChart } from "./components/charts/ComparisonChart";
import { DonutChart } from "./components/charts/DonutChart";
import { CinematicTitle } from "./components/text/CinematicTitle";
import { Fireflies } from "./components/particles/Fireflies";

/**
 * 注意：这里必须用 type 而不是 interface。
 * Remotion 的 <Composition /> 会把 props 约束到 Record<string, unknown>，
 * 而 TS 只给 type alias 隐式索引签名，interface 会推断失败。
 *
 * props 直接就是「视频规格」本身（而不是 { spec } 包一层），
 * 这样 <Composition schema={VideoSpecSchema} /> 才能把字段暴露给 Studio 编辑。
 */
type VideoRendererProps = VideoSpecInput;

// 渲染单个元素
const RenderElement: React.FC<{
  element: Element;
  shotDurationInFrames: number;
  cameraMotion?: CameraMotionConfig;
}> = ({ element, shotDurationInFrames, cameraMotion }) => {
  const { component, data, position } = element;
  const { width, height } = useVideoConfig();

  const style: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: `translate(-50%, -50%) translate3d(${position.x}px, ${position.y}px, ${position.z}px)`,
  };

  switch (component) {
    case "RotatingEarth":
      return (
        <div style={{ ...style, width: "100%", height: "100%" }}>
          <ThreeCanvas
            width={width}
            height={height}
            camera={{
              position: [0, 0, data.cameraZ ?? 4.6],
              fov: data.fov ?? 40,
            }}
          >
            {/* 镜头运动：spec 里写的 push-in / orbit 等在这里真正生效 */}
            <CameraRig
              motion={cameraMotion}
              shotDurationInFrames={shotDurationInFrames}
              baseZ={data.cameraZ ?? 4.6}
              fov={data.fov ?? 40}
            />
            <RotatingEarth
              rotationSpeed={data.rotationSpeed || 0.002}
              axialTilt={data.axialTilt ?? 23.44}
              sunDirection={data.sunDirection ?? [1, 0.35, 0.6]}
              showAtmosphere={data.showAtmosphere !== false}
              showStars={data.showStars !== false}
              showClouds={data.showClouds !== false}
              showNightLights={data.showNightLights !== false}
              showBackground={data.showBackground !== false}
              quality={data.quality ?? "high"}
              enablePostFx={data.enablePostFx !== false}
              bloomIntensity={data.bloomIntensity ?? 0.85}
              bloomThreshold={data.bloomThreshold ?? 0.62}
              vignette={data.vignette ?? 0.55}
              enableDof={data.enableDof === true}
              sunIntensity={data.sunIntensity ?? 3}
            />
          </ThreeCanvas>
        </div>
      );

    case "CardStack3D":
      return (
        <div style={style}>
          <CardStack3D
            count={data.count || 8}
            colors={data.colors}
            labels={data.labels}
          />
        </div>
      );

    case "SmoothLineChart":
      return (
        <div style={style}>
          <SmoothLineChart
            data={data.data || []}
            width={data.width || 800}
            height={data.height || 400}
            color={data.color || "#4a90e2"}
          />
        </div>
      );

    case "BarChart":
      return (
        <div style={style}>
          <BarChart
            data={data.data || []}
            width={data.width || 600}
            height={data.height || 400}
            color={data.color || "#4a90e2"}
          />
        </div>
      );

    case "ComparisonChart":
      return (
        <div style={style}>
          <ComparisonChart
            data={data.data || []}
            width={data.width || 800}
            height={data.height || 400}
          />
        </div>
      );

    case "DonutChart":
      return (
        <div style={style}>
          <DonutChart
            data={data.data || []}
            width={data.width || 400}
            height={data.height || 400}
          />
        </div>
      );

    case "CinematicTitle":
      return (
        <div style={{ ...style, width: "100%", height: "200px" }}>
          <CinematicTitle
            text={data.text || ""}
            fontSize={data.fontSize || 64}
            color={data.color || "white"}
            glowColor={data.glowColor || "#4a90e2"}
            animation={data.animation || "fade-up"}
          />
        </div>
      );

    case "Fireflies":
      return (
        <div style={{ ...style, width: "100%", height: "100%", pointerEvents: "none" }}>
          <Fireflies
            count={data.count || 50}
            color={data.color || "#ccff00"}
          />
        </div>
      );

    default:
      return <div style={style}>Unknown component: {component}</div>;
  }
};

// 渲染单个镜头
const RenderShot: React.FC<{ shot: Shot; fps: number }> = ({ shot, fps }) => {
  const durationInFrames = Math.round(shot.duration * fps);
  const cameraMotion = shot.camera?.motion as CameraMotionConfig | undefined;

  return (
    <Sequence from={Math.round(shot.startTime * fps)} durationInFrames={durationInFrames}>
      <AbsoluteFill style={{ backgroundColor: "#111" }}>
        {/* 渲染元素 */}
        {shot.elements.map((element) => (
          <Sequence key={element.id} from={0} durationInFrames={durationInFrames}>
            <RenderElement
              element={element}
              shotDurationInFrames={durationInFrames}
              cameraMotion={cameraMotion}
            />
          </Sequence>
        ))}
      </AbsoluteFill>
    </Sequence>
  );
};

export const VideoRenderer: React.FC<VideoRendererProps> = (rawSpec) => {
  // 用 schema 补齐所有 .default()，下游组件拿到的永远是完整的 VideoSpec
  const spec: VideoSpec = VideoSpecSchema.parse(rawSpec);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {spec.shots.map((shot) => (
        <RenderShot key={shot.id} shot={shot} fps={spec.fps} />
      ))}
    </AbsoluteFill>
  );
};
