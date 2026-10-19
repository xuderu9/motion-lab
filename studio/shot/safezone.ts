// 安全区 —— 字幕由人类在剪映里加，我们只负责**留出位置**。
//
// 用户决定：字幕不在渲染里做，后期用剪映加。
// 所以所有版面都必须遵守一条硬约束：
//
//   ┌──────────────────────────┐  y=0
//   │                          │
//   │        内容安全区         │
//   │                          │
//   ├──────────────────────────┤  y = h * (1 - SUBTITLE_BAND)
//   │   字幕带（不许放内容）      │  22% 高，够中英双语两行
//   └──────────────────────────┘  y = h
//
// 参考片实测底部留了 28%（中文大字 + 英文小字），我们取 22% —— 略紧一点，
// 给内容多留 6% 高度，同时两行字幕仍然放得下。
//
// 另外左右各留 5.5% 的边距，避免字幕在窄屏上贴边。

export const SUBTITLE_BAND = 0.22;
export const SAFE_MARGIN_X = 0.055;

/** 内容区的底部 y（超过它就算侵入字幕带） */
export function safeBottom(h: number): number {
  return h * (1 - SUBTITLE_BAND);
}

/** 内容区的宽（左右各让出边距） */
export function safeWidth(w: number): number {
  return w * (1 - SAFE_MARGIN_X * 2);
}

/** 内容区左上角 x */
export function safeLeft(w: number): number {
  return w * SAFE_MARGIN_X;
}

/**
 * 调试用：把安全区画出来。
 * spec.debug = "safe" 时启用，用于验收「有没有内容跑进字幕带」。
 */
export function drawSafeGuides(g: CanvasRenderingContext2D, w: number, h: number) {
  const b = safeBottom(h);
  g.save();
  // 字幕带：淡红底 + 虚线边界
  g.fillStyle = "rgba(255,60,90,0.10)";
  g.fillRect(0, b, w, h - b);
  g.strokeStyle = "rgba(255,60,90,0.85)";
  g.lineWidth = 2;
  g.setLineDash([12, 10]);
  g.beginPath();
  g.moveTo(0, b);
  g.lineTo(w, b);
  g.stroke();
  // 左右边距
  g.beginPath();
  g.moveTo(w * SAFE_MARGIN_X, 0);
  g.lineTo(w * SAFE_MARGIN_X, h);
  g.moveTo(w * (1 - SAFE_MARGIN_X), 0);
  g.lineTo(w * (1 - SAFE_MARGIN_X), h);
  g.stroke();
  g.setLineDash([]);
  // 说明文字
  g.fillStyle = "rgba(255,60,90,0.95)";
  g.font = `700 ${Math.round(h * 0.022)}px "Helvetica Neue", Arial, sans-serif`;
  g.textBaseline = "alphabetic";
  g.fillText("SUBTITLE SAFE AREA · 字幕带 22%", w * SAFE_MARGIN_X + 8, b + h * 0.032);
  g.restore();
}
