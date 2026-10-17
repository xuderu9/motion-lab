// 代码窗口版式家族 —— 3 个**排布**变体
//
//   variant 0  codeFullBleed  全幅编辑器（顶部标签页 + 行号 + minimap + 状态栏）
//   variant 1  codeSplit      左侧文件树 + 右侧编辑器
//   variant 2  codeTerminal   上下分屏：上半代码 / 下半终端输出
//
// 变体之间是排布差异，不是配色差异（M1-DESIGN §6 陷阱 1）。
// 每个变体自带 ≥3 个独立连续运动源，列在文件末尾 CODE_MOTION_SOURCES。

import {
  caret,
  chip,
  ellipsize,
  measure,
  mmss,
  mod,
  panel,
  progressBar,
  pulse,
  rr,
  setFont,
  text,
  topBar,
} from "../chrome";
import type { CodeContent, LayoutDraw, Theme } from "../types";
import { CANVAS_H, CANVAS_W } from "../types";

const PAD = 48;

/**
 * 等宽字体。
 *
 * 先走 setFont（保证 check-shot 的字号扫描能看到字号），再换字体族。
 * 代码窗口用比例字体会立刻"不像代码"，而 chrome.ts 只提供一种字体，
 * 所以这里做局部覆盖，不改共享外壳。
 */
const MONO = "'Cascadia Mono','Consolas','Courier New',monospace";
function mono(g: CanvasRenderingContext2D, size: number, weight = 400) {
  setFont(g, size, weight);
  g.font = `${weight} ${size}px ${MONO}`;
}

/** 文件状态字母 → 主题色（不出现色值字面量） */
function statusColor(st: string | undefined, theme: Theme): string {
  if (st === "A") return theme.accent2;
  if (st === "D") return theme.accent;
  if (st === "M") return theme.accent;
  return theme.textFaint;
}

function activeIndexOf(t: number, n: number, speed = 0.42): number {
  return n > 0 ? Math.floor(mod(t * speed, n)) : 0;
}

/** 一行代码的缩进宽度（前导空格按 0.62em 计） */
function indentPx(line: string, size: number): number {
  let n = 0;
  while (n < line.length && line[n] === " ") n++;
  return n * size * 0.62;
}

// ---------------------------------------------------------------------------
// variant 0：全幅编辑器
// ---------------------------------------------------------------------------

const codeFullBleed: LayoutDraw = (g, t, raw, theme) => {
  const c = raw as CodeContent;
  topBar(g, theme, t, { title: c.heading, breadcrumb: c.breadcrumb, right: mmss(t) });

  const TAB_H = 60;
  const TAB_Y = 88;
  const files = c.files.slice(0, 5);
  const activeTab = activeIndexOf(t, files.length, 0.38);

  // 顶部标签页：活动页底色更重（离散切换，不是主运动源）
  let tx = PAD;
  files.forEach((f, i) => {
    const label = ellipsize(g, f.name, 260, 34, 500);
    const w = measure(g, label, 34, 500) + 56;
    if (i === activeTab) {
      g.fillStyle = theme.panelStrong;
      rr(g, tx, TAB_Y + 8, w, TAB_H - 8, 12);
      g.fill();
      g.fillStyle = theme.accent;
      rr(g, tx + 16, TAB_Y + TAB_H - 6, w - 32, 3, 1.5);
      g.fill();
    }
    text(g, label, tx + 28, TAB_Y + 40, theme, {
      size: 34,
      weight: i === activeTab ? 600 : 400,
      tone: i === activeTab ? "text" : "textDim",
    });
    tx += w + 6;
  });
  g.fillStyle = theme.grid;
  g.fillRect(0, TAB_Y + TAB_H - 1, CANVAS_W, 1);

  // 编辑器面板
  const EX = 40;
  const EY = 164;
  const EW = CANVAS_W - 80;
  const EH = 872;
  panel(g, EX, EY, EW, EH, theme, { r: 18, shadow: 0.35 });

  const GUTTER = 84;
  const LINE_H = 44;
  const SIZE = 34;
  const TOP = EY + 30;
  const visible = Math.floor((EH - 60) / LINE_H);
  const lines = c.code;
  const scroll = mod(t * 26, Math.max(1, lines.length) * LINE_H);
  const start = Math.floor(scroll / LINE_H);
  const off = scroll - start * LINE_H;

  // 活动行高亮带：逐行下移（运动源）
  const activeRow = Math.floor(mod(t * 0.62, visible));
  g.fillStyle = theme.accentSoft;
  rr(g, EX + 8, TOP + activeRow * LINE_H + 6, EW - 16, LINE_H - 6, 8);
  g.fill();

  g.save();
  g.beginPath();
  g.rect(EX + 6, EY + 12, EW - 12, EH - 24);
  g.clip();

  for (let r = -1; r <= visible; r++) {
    const idx = start + r;
    const y = TOP + r * LINE_H - off + LINE_H - 12;
    if (y < EY || y > EY + EH) continue;
    const ln = mod(idx, lines.length);

    // 行号
    mono(g, SIZE, 400);
    g.fillStyle = theme.textFaint;
    g.textAlign = "right";
    g.fillText(String(ln + 1), EX + GUTTER - 20, y);
    g.textAlign = "left";

    // 代码
    const src = lines[ln];
    mono(g, SIZE, 400);
    g.fillStyle = theme.text;
    g.fillText(src, EX + GUTTER + 20, y, EW - GUTTER - 160);
  }
  g.restore();

  // 光标：贴在活动行末尾（运动源）
  const caretLine = mod(start + activeRow, lines.length);
  const caretX = EX + GUTTER + 20 + indentPx(lines[caretLine], SIZE) + measure(g, lines[caretLine].trim(), SIZE, 400);
  caret(g, Math.min(caretX, EX + EW - 170), TOP + activeRow * LINE_H + LINE_H - 12, SIZE * 1.05, theme, t, 1.7);

  // 右侧 minimap：整份文件缩略 + 视窗滑块下移（运动源）
  const MX = EX + EW - 96;
  const MY = EY + 28;
  const MH = EH - 56;
  g.fillStyle = theme.panel;
  rr(g, MX, MY, 56, MH, 8);
  g.fill();
  const mmRows = 64;
  for (let i = 0; i < mmRows; i++) {
    const src = lines[mod(i, lines.length)];
    const w = Math.max(6, Math.min(44, src.length * 2.2));
    g.fillStyle = i % 7 === 0 ? theme.accent : theme.textFaint;
    g.globalAlpha = i % 7 === 0 ? 0.55 : 0.22;
    g.fillRect(MX + 6, MY + 8 + (i * (MH - 16)) / mmRows, w, 2);
  }
  g.globalAlpha = 1;
  const thumbH = Math.max(40, (MH - 16) * (visible / lines.length));
  const thumbY = MY + 8 + (MH - 16 - thumbH) * mod(t * 0.17, 1);
  g.fillStyle = theme.accent;
  g.globalAlpha = 0.28;
  rr(g, MX + 4, thumbY, 48, thumbH, 6);
  g.fill();
  g.globalAlpha = 1;

  // 状态栏：行列号持续跳动（运动源）
  const lnNow = mod(start + activeRow, lines.length) + 1;
  const colNow = 1 + Math.floor(mod(t * 37, Math.max(8, lines[mod(start + activeRow, lines.length)].length)));
  text(g, `${lnNow} : ${colNow}`, PAD, 1072, theme, { size: 34, tone: "textDim" });
  if (c.language) {
    const lw = measure(g, c.language, 34, 500) + 44;
    chip(g, c.language, CANVAS_W - PAD - lw, 1046, theme, { size: 34, h: 46, padX: 22 });
  }
  if (c.statusRight) {
    text(g, ellipsize(g, c.statusRight, 520, 34, 400), CANVAS_W - PAD - (c.language ? 150 : 0), 1120, theme, {
      size: 34,
      tone: "textFaint",
      align: "right",
    });
  }
  progressBar(g, PAD, 1146, CANVAS_W - PAD * 2, 8, mod(t * 0.13, 1), theme);
};

// ---------------------------------------------------------------------------
// variant 1：左文件树 + 右编辑器
// ---------------------------------------------------------------------------

const codeSplit: LayoutDraw = (g, t, raw, theme) => {
  const c = raw as CodeContent;
  topBar(g, theme, t, { title: c.heading, breadcrumb: c.breadcrumb, right: mmss(t) });

  const TX = PAD;
  const TY = 118;
  const TW = 420;
  const TH = 992;

  // --- 左：文件树 ---
  panel(g, TX, TY, TW, TH, theme, { r: 18, shadow: 0.35 });
  if (c.language) {
    chip(g, c.language, TX + 24, TY + 22, theme, { size: 34, h: 46, padX: 20 });
  }
  g.fillStyle = theme.grid;
  g.fillRect(TX + 20, TY + 92, TW - 40, 1);

  const ROW_H = 64;
  const ROW_TOP = TY + 112;
  const rows = c.files;
  const activeRow = activeIndexOf(t, rows.length, 0.34);
  const scroll = mod(t * 9, ROW_H);
  const visibleRows = Math.floor((TH - 150) / ROW_H);

  // 活动行指示条平滑滑动（运动源）
  const barY = ROW_TOP + activeRow * ROW_H + 6;
  g.fillStyle = theme.accentSoft;
  rr(g, TX + 12, barY, TW - 24, ROW_H - 12, 10);
  g.fill();
  g.fillStyle = theme.accent;
  rr(g, TX + 12, barY + 10, 4, ROW_H - 32, 2);
  g.fill();

  g.save();
  g.beginPath();
  g.rect(TX + 10, ROW_TOP - 6, TW - 20, TH - 132);
  g.clip();
  for (let r = 0; r < visibleRows + 2; r++) {
    const i = mod(r, rows.length);
    const y = ROW_TOP + r * ROW_H - scroll;
    const f = rows[i];
    text(g, ellipsize(g, f.name, TW - 130, 34, 500), TX + 30, y + 42, theme, {
      size: 34,
      weight: i === activeRow ? 600 : 400,
      tone: i === activeRow ? "text" : "textDim",
    });
    if (f.status) {
      text(g, f.status, TX + TW - 34, y + 42, theme, {
        size: 34,
        weight: 600,
        align: "right",
        color: statusColor(f.status, theme),
      });
    }
  }
  g.restore();

  // 树滚动条（运动源）
  const sbX = TX + TW - 10;
  g.fillStyle = theme.panel;
  g.fillRect(sbX, ROW_TOP, 4, TH - 160);
  const sbH = Math.max(60, (TH - 160) * (visibleRows / Math.max(1, rows.length)));
  g.fillStyle = theme.textFaint;
  g.globalAlpha = 0.5;
  rr(g, sbX, ROW_TOP + (TH - 160 - sbH) * mod(t * 0.21, 1), 4, sbH, 2);
  g.fill();
  g.globalAlpha = 1;

  // --- 右：编辑器 ---
  const EX = PAD + TW + 26;
  const EY = TY;
  const EW = CANVAS_W - EX - PAD;
  const EH = TH;
  panel(g, EX, EY, EW, EH, theme, { r: 18, shadow: 0.35 });

  const fname = rows[activeRow]?.name ?? c.heading;
  text(g, ellipsize(g, fname, EW - 120, 34, 600), EX + 24, EY + 52, theme, { size: 34, weight: 600 });
  g.fillStyle = theme.grid;
  g.fillRect(EX + 20, EY + 76, EW - 40, 1);

  const GUTTER = 78;
  const LINE_H = 42;
  const SIZE = 34;
  const TOP = EY + 104;
  const visible = Math.floor((EH - 170) / LINE_H);
  const lines = c.code;
  const start = Math.floor(mod(t * 15, Math.max(1, lines.length) * LINE_H) / LINE_H);
  const activeLine = mod(start + Math.floor(mod(t * 0.55, visible)), lines.length);

  g.save();
  g.beginPath();
  g.rect(EX + 8, EY + 84, EW - 16, EH - 150);
  g.clip();

  for (let r = 0; r < visible; r++) {
    const idx = mod(start + r, lines.length);
    const y = TOP + r * LINE_H + LINE_H - 12;
    const isActive = idx === activeLine;
    if (isActive) {
      g.fillStyle = theme.accentSoft;
      rr(g, EX + 8, TOP + r * LINE_H + 2, EW - 16, LINE_H - 4, 6);
      g.fill();
    }
    mono(g, SIZE, 400);
    g.fillStyle = theme.textFaint;
    g.textAlign = "right";
    g.fillText(String(idx + 1), EX + GUTTER - 16, y);
    g.textAlign = "left";

    mono(g, SIZE, 400);
    g.fillStyle = isActive ? theme.text : theme.textDim;
    g.fillText(lines[idx], EX + GUTTER + 16, y, EW - GUTTER - 90);
  }
  g.restore();

  // diff 标记列：奇数行画 +，每 7 行画 −（静态结构，配合滚动产生变化）
  for (let r = 0; r < visible; r++) {
    const idx = mod(start + r, lines.length);
    const y = TOP + r * LINE_H + LINE_H - 12;
    if (idx % 7 === 0) {
      mono(g, SIZE, 700);
      g.fillStyle = theme.accent;
      g.fillText("-", EX + 16, y);
    } else if (idx % 3 === 0) {
      mono(g, SIZE, 700);
      g.fillStyle = theme.accent2;
      g.fillText("+", EX + 16, y);
    }
  }

  // 右编辑器底部进度（运动源）
  progressBar(g, EX + 24, EY + EH - 40, EW - 48, 8, mod(t * 0.15, 1), theme);
  text(g, mmss(t), EX + EW - 24, EY + 44, theme, { size: 34, tone: "textFaint", align: "right" });
};

// ---------------------------------------------------------------------------
// variant 2：上下分屏（代码 + 终端）
// ---------------------------------------------------------------------------

const codeTerminal: LayoutDraw = (g, t, raw, theme) => {
  const c = raw as CodeContent;
  topBar(g, theme, t, { title: c.heading, breadcrumb: c.breadcrumb, right: mmss(t) });

  // --- 上：紧凑编辑器 ---
  const EX = 40;
  const EY = 112;
  const EW = CANVAS_W - 80;
  // 上半屏压得更矮，让「上下分屏」的比例和 variant 1 的「左右分栏」明显不同
  const EH = 400;
  panel(g, EX, EY, EW, EH, theme, { r: 18, shadow: 0.3 });

  if (c.files[0]) {
    text(g, ellipsize(g, c.files[0].name, EW - 300, 34, 600), EX + 24, EY + 50, theme, {
      size: 34,
      weight: 600,
    });
  }
  if (c.language) {
    const lw = measure(g, c.language, 34, 500) + 40;
    chip(g, c.language, EX + EW - 24 - lw, EY + 18, theme, { size: 34, h: 44, padX: 20 });
  }
  g.fillStyle = theme.grid;
  g.fillRect(EX + 20, EY + 72, EW - 40, 1);

  const GUTTER = 76;
  const LINE_H = 40;
  const SIZE = 34;
  const TOP = EY + 96;
  const lines = c.code;
  const vis = Math.floor((EH - 120) / LINE_H);
  // 横向滚动：长行整体左移（运动源）
  const hoff = 26 * mod(t * 0.9, 1);
  const start = Math.floor(mod(t * 18, Math.max(1, lines.length) * LINE_H) / LINE_H);

  g.save();
  g.beginPath();
  g.rect(EX + 8, EY + 80, EW - 16, EH - 100);
  g.clip();
  for (let r = 0; r < vis; r++) {
    const idx = mod(start + r, lines.length);
    const y = TOP + r * LINE_H + LINE_H - 10;
    mono(g, SIZE, 400);
    g.fillStyle = theme.textFaint;
    g.textAlign = "right";
    g.fillText(String(idx + 1), EX + GUTTER - 14, y);
    g.textAlign = "left";
    mono(g, SIZE, 400);
    g.fillStyle = r === 2 ? theme.text : theme.textDim;
    g.fillText(lines[idx], EX + GUTTER + 14 - hoff, y, EW - GUTTER - 60);
  }
  g.restore();

  // 分隔条 + 拖动把手（运动源：把手呼吸）
  const SY = EY + EH + 22;
  g.fillStyle = theme.grid;
  g.fillRect(0, SY + 10, CANVAS_W, 1);
  g.fillStyle = theme.panelStrong;
  rr(g, CANVAS_W / 2 - 90, SY, 180, 22, 11);
  g.fill();
  g.globalAlpha = 0.35 + 0.45 * pulse(t, 0.55);
  g.fillStyle = theme.accent;
  rr(g, CANVAS_W / 2 - 30, SY + 9, 60, 4, 2);
  g.fill();
  g.globalAlpha = 1;

  // --- 下：终端 ---
  const TY = SY + 44;
  const TH = CANVAS_H - TY - 40;
  panel(g, EX, TY, EW, TH, theme, { r: 18, shadow: 0.35, fill: theme.panelStrong });

  // 终端标题带：一整条横向色带，是 variant 2 的排布指纹
  g.save();
  rr(g, EX, TY, EW, TH, 18);
  g.clip();
  g.fillStyle = theme.accentSoft;
  g.fillRect(EX, TY, EW, 64);
  g.restore();

  // 三个窗口圆点（图形，不是文案）
  for (let i = 0; i < 3; i++) {
    g.fillStyle = i === 0 ? theme.accent2 : i === 1 ? theme.accent : theme.textFaint;
    g.globalAlpha = 0.55 + 0.35 * Math.sin(t * 1.6 + i * 1.1);
    g.beginPath();
    g.arc(EX + 32 + i * 22, TY + 34, 7, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  // 计时器持续跳动（运动源）
  text(g, mmss(t), EX + EW - 24, TY + 46, theme, { size: 34, tone: "textDim", align: "right" });
  g.fillStyle = theme.grid;
  g.fillRect(EX + 20, TY + 66, EW - 40, 1);

  const term = c.terminal ?? [];
  const TL = 40;
  const TSIZE = 34;
  const shown = Math.floor(mod(t * 1.9, term.length + 3));
  for (let i = 0; i < shown && i < term.length; i++) {
    const y = TY + 108 + i * TL;
    if (y > TY + TH - 46) break;
    mono(g, TSIZE, 400);
    g.fillStyle = i === shown - 1 ? theme.text : theme.textDim;
    g.fillText(term[i], EX + 28, y, EW - 60);
  }
  // 终端块光标（运动源）
  const lastY = TY + 108 + Math.min(shown, term.length) * TL;
  if (lastY < TY + TH - 40) {
    const bx = EX + 28;
    if (Math.floor(t * 1.8) % 2 === 0) {
      g.fillStyle = theme.accent2;
      g.fillRect(bx, lastY - TSIZE + 2, 16, TSIZE - 4);
    }
  }
  // 构建进度（运动源）
  progressBar(g, EX + 28, TY + TH - 34, EW - 56, 8, mod(t * 0.34, 1), theme, {
    color: theme.accent2,
  });
};

// ---------------------------------------------------------------------------
// 分发表
// ---------------------------------------------------------------------------

export const CODE_VARIANTS: LayoutDraw[] = [codeFullBleed, codeSplit, codeTerminal];

/** 验收第 8 条：每个变体自有 ≥3 个独立连续运动源 */
export const CODE_MOTION_SOURCES: Record<number, string[]> = {
  0: ["代码行连续上滚", "活动行高亮带下移", "光标闪烁", "右侧 minimap 视窗滑块下移", "状态栏行列号跳动", "底部进度条"],
  1: ["文件树滚动", "活动文件指示条滑动", "树滚动条拇指下移", "代码行上滚", "活动行高亮跟随", "编辑器底部进度条"],
  2: ["代码行上滚", "代码横向平移", "分隔条把手呼吸", "终端日志逐行出现", "终端块光标闪烁", "终端计时器跳动", "构建进度条"],
};
