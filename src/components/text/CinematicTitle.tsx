/**
 * 电影级标题
 * 
 * 使用 remotion-bits 的 AnimatedText
 * 支持模糊+缩放+位移组合动画
 */

import React from "react";
import { AnimatedText } from "remotion-bits";

interface CinematicTitleProps {
  text: string;
  fontSize?: number;
  color?: string;
  glowColor?: string;
  animation?: "fade-up" | "scale-in" | "blur-in";
}

export const CinematicTitle: React.FC<CinematicTitleProps> = ({
  text,
  fontSize = 64,
  color = "white",
  glowColor = "#4a90e2",
  animation = "fade-up",
}) => {
  const getTransition = () => {
    switch (animation) {
      case "fade-up":
        return {
          y: [80, 0],
          opacity: [0, 1],
          blur: [10, 0],
          split: "word" as const,
          splitStagger: 2,
          easing: "spring" as const,
        };
      case "scale-in":
        return {
          scale: [0.8, 1],
          opacity: [0, 1],
          split: "word" as const,
          splitStagger: 3,
          easing: "spring" as const,
        };
      case "blur-in":
        return {
          blur: [20, 0],
          opacity: [0, 1],
          split: "character" as const,
          splitStagger: 1,
          easing: "ease-out" as const,
        };
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
      }}
    >
      <div
        style={{
          fontSize,
          color,
          fontWeight: "bold",
          textShadow: `0 0 40px ${glowColor}80, 0 0 80px ${glowColor}40`,
          fontFamily: "Inter, sans-serif",
          letterSpacing: "0.05em",
        }}
      >
        <AnimatedText transition={getTransition()}>{text}</AnimatedText>
      </div>
    </div>
  );
};
