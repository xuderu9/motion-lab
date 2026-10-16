/**
 * 视频渲染器
 * 
 * 根据 VideoSpec 渲染场景
 */

import React from "react";
import { Sequence, AbsoluteFill } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import type { VideoSpec, Shot, Element } from "../schema/video-spec";

// 导入组件
import { RotatingEarth } from "./3d/RotatingEarth";
import { CardStack3D } from "./3d/CardStack3D";
import { SmoothLineChart } from "./charts/SmoothLineChart";
import { BarChart } from "./charts/BarChart";
import { ComparisonChart } from "./charts/ComparisonChart";
import { DonutChart } from "./charts/DonutChart";
import { CinematicTitle } from "./text/CinematicTitle";
import { Fireflies } from "./particles/Fireflies";

interface VideoRendererProps {
  spec: VideoSpec;
}

// 渲染单个元素
const RenderElement: React.FC<{ element: Element }> = ({ element }) => {
  const { component, data, position } = element;

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
            width={1920}
            height={1080}
            camera={{ position: [0, 0, 5], fov: 50 }}
          >
            <RotatingEarth
              rotationSpeed={data.rotationSpeed || 0.002}
              showAtmosphere={data.showAtmosphere !== false}
              showStars={data.showStars !== false}
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

  return (
    <Sequence from={Math.round(shot.startTime * fps)} durationInFrames={durationInFrames}>
      <AbsoluteFill style={{ backgroundColor: "#111" }}>
        {/* 渲染元素 */}
        {shot.elements.map((element) => (
          <Sequence key={element.id} from={0} durationInFrames={durationInFrames}>
            <RenderElement element={element} />
          </Sequence>
        ))}
      </AbsoluteFill>
    </Sequence>
  );
};

export const VideoRenderer: React.FC<VideoRendererProps> = ({ spec }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {spec.shots.map((shot) => (
        <RenderShot key={shot.id} shot={shot} fps={spec.fps} />
      ))}
    </AbsoluteFill>
  );
};
