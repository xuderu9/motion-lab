/**
 * 字幕显示 + 音频同步
 * 
 * 根据字幕时间戳显示文字
 */

import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { Subtitle } from "../schema/video-spec";

interface AudioSyncProps {
  subtitles: Subtitle[];
  position?: { x: number; y: number };
  fontSize?: number;
  color?: string;
}

export const AudioSync: React.FC<AudioSyncProps> = ({
  subtitles,
  position = { x: 0, y: 400 },
  fontSize = 48,
  color = "white",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  // 找到当前时间应该显示的字幕
  const activeSubtitle = subtitles.find(
    (s) => currentTime >= s.start && currentTime <= s.end
  );

  if (!activeSubtitle) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: `calc(50% + ${position.y}px)`,
        transform: `translate(-50%, -50%)`,
        fontSize,
        color,
        fontWeight: "bold",
        textShadow: "0 2px 10px rgba(0, 0, 0, 0.8)",
        fontFamily: "Inter, sans-serif",
        textAlign: "center",
        zIndex: 1000,
      }}
    >
      {activeSubtitle.text}
    </div>
  );
};
