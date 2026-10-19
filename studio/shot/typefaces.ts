// 字体配对 —— 参考片最强的视觉签名。
//
// 拆片看到：几乎每个大标题都是「无衬线粗体 + 衬线斜体强调色」混排：
//     a few  |frames|        5  |months|        one  |habit|
// 这不是装饰，是让一句话里出现两种节奏。我们之前的 40px 单一字体完全没有这个。
//
// 约束：必须用**系统里真的存在**的字体。这里只选 Windows/macOS 都有的 web-safe 族，
// 缺字时回退到中文字体，避免画出来是空白框。

/** 展示级无衬线（粗、几何、字面大） */
export const SANS = '"Arial Black", "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif';
/** 展示级衬线（斜体强调） */
export const SERIF_IT = 'Georgia, "Times New Roman", "Songti SC", serif';
/** 正文/标签用无衬线 */
export const SANS_UI = '"Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif';
/** 等宽（代码、数值） */
export const MONO = '"JetBrains Mono", Consolas, "Courier New", monospace';

/**
 * 把标题拆成「主体 + 强调段」，用于混排。
 * 规则：英文取最后一个词，中文取最后 2 个字。强调段用衬线斜体 + 强调色。
 */
export function splitHeadline(text: string): { main: string; accent: string } {
  const s = (text ?? "").trim();
  if (!s) return { main: "", accent: "" };
  if (/\s/.test(s)) {
    const i = s.lastIndexOf(" ");
    const main = s.slice(0, i).trim();
    const accent = s.slice(i + 1).trim();
    // 主体太短就不拆（避免只剩一个冠词时视觉失衡）
    if (main.length >= 2) return { main, accent };
  }
  const arr = Array.from(s);
  if (arr.length > 4) return { main: arr.slice(0, -2).join(""), accent: arr.slice(-2).join("") };
  return { main: s, accent: "" };
}

/** 手动加字距绘制（Canvas 的 letterSpacing 兼容性不稳，自己画最可靠） */
export function spacedText(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
) {
  let cx = x;
  for (const ch of Array.from(text)) {
    g.fillText(ch, cx, y);
    cx += g.measureText(ch).width + spacing;
  }
  return cx - x - spacing;
}

/** 量一段手动字距文本的宽度 */
export function measureSpaced(g: CanvasRenderingContext2D, text: string, spacing: number): number {
  let w = 0;
  for (const ch of Array.from(text)) w += g.measureText(ch).width + spacing;
  return Math.max(0, w - spacing);
}

/** 画「主体粗体 + 强调衬线斜体」的混排标题，返回总宽 */
export function mixedHeadline(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  baselineY: number,
  fontPx: number,
  accentColor: string,
  baseColor: string,
): number {
  const { main, accent } = splitHeadline(text);
  g.textBaseline = "alphabetic";
  g.font = `900 ${fontPx}px ${SANS}`;
  g.fillStyle = baseColor;
  g.fillText(main, x, baselineY);
  const w1 = g.measureText(main).width;
  if (accent) {
    // 只有**拉丁字母**的强调段才用衬线斜体（参考片里 a few |frames| 就是这样）。
    // 中文没有真正的斜体，强行斜体会变成合成的假斜体，很难看；
    // 中文强调一律「同字体 + 强调色」，这也是参考片 v2 的做法（挑你的引擎）。
    const isLatin = /^[\x20-\x7E]+$/.test(accent);
    g.font = isLatin
      ? `italic ${Math.round(fontPx * 1.02)}px ${SERIF_IT}`
      : `900 ${fontPx}px ${SANS}`;
    g.fillStyle = accentColor;
    const gap = isLatin ? fontPx * 0.14 : fontPx * 0.02;
    g.fillText(accent, x + w1 + gap, baselineY);
    return w1 + gap + g.measureText(accent).width;
  }
  return w1;
}
