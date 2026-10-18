// 卡片里能装的东西。
//
// ═══ 为什么要有这一层 ═══
// 用户的原话：「卡片中不一定是文字，也可以是动画等，任何画面都可以用卡片展示」。
//
// 所以卡片不是「一个标题 + 一段正文」，而是**一个容器**：
// 里面可以放文字，也可以放环形进度、柱状、折线、代码、图标、图片、粒子。
// 场景只负责「把一堆卡片摆开、让它们动」，
// 卡片内部画什么由 drawVisual 决定，两者互不干扰。
//
// 这条也顺带解决了「文字太长不精炼」：文字只是 visual 的一种，
// 而且是最短的 `text` 那种 —— 卡片的主视觉应该是画面，不是一大段字。

import type { Theme } from "../types";

export type Visual =
  /** 一段短文字（≤8 字），卡片最普通的内容 */
  | { kind: "text"; text: string; sub?: string }
  /** 一个大数字 */
  | { kind: "stat"; value: string; label?: string }
  /** 环形进度（0~1） */
  | { kind: "ring"; value: number; label?: string }
  /** 柱状组 */
  | { kind: "bars"; values: number[]; label?: string }
  /** 折线 / 迷你走势 */
  | { kind: "spark"; values: number[]; label?: string }
  /** 图标：用几何图形画，不依赖字体 emoji */
  | { kind: "icon"; shape: "play" | "check" | "arrow" | "dot" | "square" | "bolt"; label?: string }
  /** 几行代码 */
  | { kind: "code"; lines: string[]; label?: string }
  /** 图片（public 下的路径） */
  | { kind: "image"; src: string; label?: string };

const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif';

/** 按宽度截断（所有文字都必须过这一关，否则会溢出卡片） */
export function fitText(g: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (g.measureText(text).width <= maxW) return text;
  let out = text;
  while (out.length > 1 && g.measureText(out + "…").width > maxW) out = out.slice(0, -1);
  return out + "…";
}

/**
 * 画一个 visual，占满给定矩形（x,y,w,h）。
 * 每个分支都必须**自己动**（不依赖场景），这样卡片静止时里面也是活的。
 */
export function drawVisual(
  g: CanvasRenderingContext2D,
  v: Visual,
  t: number,
  theme: Theme,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  g.save();
  g.textBaseline = "top";
  const label = ("label" in v && v.label) || "";

  switch (v.kind) {
    case "text": {
      g.fillStyle = theme.text;
      g.font = `600 ${Math.round(h * 0.42)}px ${FONT}`;
      let ty = y;
      const lines = splitLines(v.text, 8);
      for (const ln of lines) {
        g.fillText(fitText(g, ln, w), x, ty);
        ty += h * 0.44;
      }
      if (v.sub) {
        g.fillStyle = theme.textDim;
        g.font = `400 ${Math.round(h * 0.22)}px ${FONT}`;
        g.fillText(fitText(g, v.sub, w), x, ty + 2);
      }
      break;
    }
    case "stat": {
      g.fillStyle = theme.accent;
      g.font = `700 ${Math.round(h * 0.46)}px ${FONT}`;
      g.fillText(fitText(g, v.value, w), x, y);
      if (label) {
        g.fillStyle = theme.textDim;
        g.font = `400 ${Math.round(h * 0.19)}px ${FONT}`;
        g.fillText(fitText(g, label, w), x, y + h * 0.5);
      }
      break;
    }
    case "ring": {
      const r = Math.min(w, h) * 0.36;
      const cx = x + w * 0.5;
      const cy = y + h * 0.46;
      g.lineWidth = r * 0.16;
      g.strokeStyle = theme.panelBorder;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.stroke();
      // 进度随 t 缓慢呼吸，不会静止
      const p = Math.max(0, Math.min(1, v.value * (0.82 + 0.18 * Math.sin(t * 0.9))));
      g.strokeStyle = theme.accent;
      g.lineCap = "round";
      g.beginPath();
      g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
      g.stroke();
      g.fillStyle = theme.text;
      g.font = `600 ${Math.round(r * 0.62)}px ${FONT}`;
      g.textAlign = "center";
      g.fillText(fitText(g, `${Math.round(v.value * 100)}%`, r * 1.6), cx, cy - r * 0.32);
      g.textAlign = "start";
      if (label) {
        g.fillStyle = theme.textDim;
        g.font = `400 ${Math.round(h * 0.16)}px ${FONT}`;
        g.textAlign = "center";
        g.fillText(fitText(g, label, w * 0.9), cx, y + h - h * 0.12);
        g.textAlign = "start";
      }
      break;
    }
    case "bars": {
      const n = Math.max(1, v.values.length);
      const max = Math.max(...v.values, 1);
      const bw = (w / n) * 0.6;
      const gap = (w - bw * n) / (n + 1);
      for (let i = 0; i < n; i++) {
        const grow = 0.55 + 0.45 * Math.sin(t * 1.1 + i * 0.7);
        const hh = (v.values[i] / max) * h * 0.62 * grow;
        g.fillStyle = i === n - 1 ? theme.accent : theme.accentSoft;
        g.fillRect(x + gap + i * (bw + gap), y + h * 0.7 - hh, bw, hh);
      }
      if (label) {
        g.fillStyle = theme.textDim;
        g.font = `400 ${Math.round(h * 0.16)}px ${FONT}`;
        g.fillText(fitText(g, label, w), x, y + h * 0.78);
      }
      break;
    }
    case "spark": {
      const n = v.values.length;
      if (n > 1) {
        const max = Math.max(...v.values);
        const min = Math.min(...v.values);
        const span = Math.max(1e-6, max - min);
        const pts: [number, number][] = v.values.map((val, i) => [
          x + (i / (n - 1)) * w,
          y + h * 0.62 - ((val - min) / span) * h * 0.4,
        ]);
        // 逐段画出，尾端随 t 延伸（常驻微动）
        const prog = 0.75 + 0.25 * Math.sin(t * 0.6);
        const upto = Math.max(2, Math.round(pts.length * prog));
        g.strokeStyle = theme.accent;
        g.lineWidth = Math.max(2, h * 0.02);
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < upto; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.stroke();
      }
      if (label) {
        g.fillStyle = theme.textDim;
        g.font = `400 ${Math.round(h * 0.16)}px ${FONT}`;
        g.fillText(fitText(g, label, w), x, y + h * 0.78);
      }
      break;
    }
    case "icon": {
      const s = Math.min(w, h) * 0.34;
      const cx = x + w * 0.5;
      const cy = y + h * 0.44;
      const pulse = 1 + 0.06 * Math.sin(t * 2.4);
      g.translate(cx, cy);
      g.scale(pulse, pulse);
      g.fillStyle = theme.accent;
      g.strokeStyle = theme.accent;
      g.lineWidth = s * 0.14;
      g.beginPath();
      if (v.shape === "play") {
        g.moveTo(-s * 0.35, -s * 0.5);
        g.lineTo(s * 0.55, 0);
        g.lineTo(-s * 0.35, s * 0.5);
        g.closePath();
        g.fill();
      } else if (v.shape === "check") {
        g.moveTo(-s * 0.45, 0);
        g.lineTo(-s * 0.1, s * 0.36);
        g.lineTo(s * 0.5, -s * 0.4);
        g.stroke();
      } else if (v.shape === "arrow") {
        g.moveTo(-s * 0.5, 0);
        g.lineTo(s * 0.45, 0);
        g.moveTo(s * 0.15, -s * 0.3);
        g.lineTo(s * 0.5, 0);
        g.lineTo(s * 0.15, s * 0.3);
        g.stroke();
      } else if (v.shape === "bolt") {
        g.moveTo(s * 0.1, -s * 0.55);
        g.lineTo(-s * 0.35, s * 0.08);
        g.lineTo(0, s * 0.08);
        g.lineTo(-s * 0.1, s * 0.55);
        g.lineTo(s * 0.35, -s * 0.08);
        g.lineTo(0, -s * 0.08);
        g.closePath();
        g.fill();
      } else if (v.shape === "square") {
        const r = s * 0.28;
        g.roundRect(-s * 0.42, -s * 0.42, s * 0.84, s * 0.84, r);
        g.stroke();
      } else {
        g.arc(0, 0, s * 0.32, 0, Math.PI * 2);
        g.fill();
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (label) {
        g.fillStyle = theme.textDim;
        g.font = `400 ${Math.round(h * 0.16)}px ${FONT}`;
        g.textAlign = "center";
        g.fillText(fitText(g, label, w * 0.95), cx, y + h * 0.78);
        g.textAlign = "start";
      }
      break;
    }
    case "code": {
      g.fillStyle = theme.textDim;
      g.font = `400 ${Math.round(h * 0.16)}px "JetBrains Mono", Consolas, monospace`;
      const n = Math.min(v.lines.length, 6);
      for (let i = 0; i < n; i++) {
        g.fillText(fitText(g, v.lines[i], w), x, y + i * h * 0.19);
      }
      break;
    }
    case "image": {
      // 图片可能在渲染时还没加载完，用主题色占位，不阻塞
      g.fillStyle = theme.panelStrong;
      g.fillRect(x, y, w, h * 0.8);
      g.strokeStyle = theme.panelBorder;
      g.strokeRect(x, y, w, h * 0.8);
      if (label) {
        g.fillStyle = theme.textDim;
        g.font = `400 ${Math.round(h * 0.16)}px ${FONT}`;
        g.fillText(fitText(g, label, w), x, y + h * 0.82);
      }
      break;
    }
  }
  g.restore();
}

/** 把长句切成 ≤n 字的行（卡片里不放长句，这是硬约束） */
export function splitLines(text: string, per: number): string[] {
  const s = text.replace(/\s+/g, "").trim();
  const out: string[] = [];
  for (let i = 0; i < s.length && out.length < 3; i += per) out.push(s.slice(i, i + per));
  return out.length ? out : [""];
}
