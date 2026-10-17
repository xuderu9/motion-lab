// 镜头声明式数据结构 —— 「一个镜头 = 一份 JSON」
//
// 这一层是整个版式库的地基。M1 只做 doc / chart 两个版式家族，
// 但类型按 6 版式的终局来设计，M2 补 code / map / timeline / cards 时只加分支，不改结构。
//
// 设计约束（见 M1-DESIGN.md §6）：
//   · variant 只能改**排布**，不能只换颜色
//   · 版式内部禁止硬编码色值，一律走 Theme token
//   · 版式内部禁止硬编码文案，字符串必须来自 content

// ---------------------------------------------------------------------------
// 画布常量
// ---------------------------------------------------------------------------

/**
 * 屏幕画布尺寸。**必须 4:3** —— 背景板上的平板屏幕是 4:3，
 * 用 16:9 贴上去会被单应变换横向压扁 33%，文字明显变形。
 */
export const CANVAS_W = 1600;
export const CANVAS_H = 1200;

/**
 * 允许的最小画布字号。
 *
 * 屏幕在成片里约 482px 宽，画布 1600 宽 → 缩放 0.301。
 * 想要成片里正文 ≥10px，画布字号必须 ≥ 10 / 0.301 ≈ 33.2。
 * 取 34（→ 10.2px）。
 *
 * `check-shot.py` 会扫描 layouts/ 下所有 `数字px`，低于此值直接判 FAIL。
 */
export const MIN_FONT_PX = 34;

/** 成片尺寸。所有 quad 坐标都在这个坐标系里。 */
export const FRAME_W = 1920;
export const FRAME_H = 1080;

// ---------------------------------------------------------------------------
// 主题 token
// ---------------------------------------------------------------------------

export type ThemeName = "light" | "deep-blue" | "warm-sand" | "cool-teal";

/** 一组语义化颜色。版式只认这些名字，不认具体色值。 */
export type Theme = {
  name: ThemeName;
  /** 浅色主题决定阴影方向、scanline 颜色、反色文字 */
  isLight: boolean;
  /** 全屏渐变起止 */
  bg: [string, string];
  /** 面板底色（半透明，叠在 bg 上） */
  panel: string;
  /** 更强的面板底色 —— 卡片这类需要「浮起来」的容器用它 */
  panelStrong: string;
  /** 面板描边 */
  panelBorder: string;
  /** 主要文字 */
  text: string;
  /** 次要文字 */
  textDim: string;
  /** 更弱的文字（轴标签、注脚） */
  textFaint: string;
  /** 主强调色 */
  accent: string;
  /** 次强调色 */
  accent2: string;
  /** 主强调色的低透明度填充 */
  accentSoft: string;
  /** 网格线 / 分隔线 */
  grid: string;
  /** 阴影色 */
  shadow: string;
  /** 顶栏底色 */
  chromeBg: string;
};

// ---------------------------------------------------------------------------
// 内容（按 layout 分支）
// ---------------------------------------------------------------------------

export type ChartSeriesItem = { label: string; value: number };

/**
 * 图表版式的内容。
 * variant 0（全幅折线）/ 1（分栏 KPI + 柱）/ 2（排名赛跑）共用同一份数据。
 */
export type ChartContent = {
  kind: "chart";
  /** 版面大标题 */
  heading: string;
  /** 标题下的一行说明 */
  subtitle?: string;
  /** 左上角那个大数字 */
  metric: {
    label: string;
    value: number;
    /** 同比变化，百分比；负值画绿色/红色由主题决定 */
    delta: number;
    unit?: string;
  };
  /** 数据序列。8~16 条为宜：variant 1 用前 16，variant 2 用前 8 */
  series: ChartSeriesItem[];
  /** 主图表类型提示，具体排布由 variant 决定 */
  mode: "line" | "bars" | "rank-race";
  /** 右上角的小标签 */
  badge?: string;
};

/** 文档版式的内容。variant 0（全幅阅读）/ 1（侧栏大纲）/ 2（卡片网格）共用。 */
export type DocContent = {
  kind: "doc";
  heading: string;
  subtitle?: string;
  /** 顶栏面包屑，如「知识库 / router.md」 */
  breadcrumb?: string;
  /** variant 0 的正文段落（会循环滚动） */
  paragraphs: string[];
  /** variant 1 的左侧大纲；缺省时用 paragraphs 的前几条自动截断 */
  outline?: string[];
  /** variant 2 的卡片；缺省时 variant 2 会退化成列表 */
  cards?: { title: string; body: string; tag: string }[];
  /** variant 0 右侧的引用分布卡 */
  sidebar?: { title: string; bars: number[] };
  /** variant 2 底部横向滚动条上的标签 */
  tags?: string[];
};

export type LayoutContent = ChartContent | DocContent;

// ---------------------------------------------------------------------------
// 版式分发表
// ---------------------------------------------------------------------------

/** M1 = doc | chart；M2 追加 code | map | timeline | cards */
export type LayoutName = "doc" | "chart";

/** 同版式的第 1/2/3 种**排布**（不是配色） */
export type Variant = 0 | 1 | 2;

/**
 * 版面主体统一签名。
 *
 * 具体版式会在函数体内把 content 收窄成自己的类型，
 * 这样分发表可以是同构的 `LayoutDraw[][]`，而每个版式内部仍然是强类型的。
 */
export type LayoutDraw = (
  g: CanvasRenderingContext2D,
  t: number,
  content: LayoutContent,
  theme: Theme,
  variant: Variant,
) => void;

// ---------------------------------------------------------------------------
// 镜头 spec
// ---------------------------------------------------------------------------

export type EnvSpec = {
  /** public/ 下的背景板路径 */
  src: string;
  /** 屏幕四角，1920 坐标系，顺序 TL → TR → BR → BL */
  quad: [number, number][];
  /** 画布空间圆角半径 */
  cornerRadius: number;
  /**
   * 背景板提亮系数，默认 1.10。
   *
   * 亮度账（实测）：屏内已 235.8 接近 255 上限，抬不动了；
   * 缺口全在房间 —— 屏外区 91 → 需 96~100，故 1.06~1.10。
   */
  exposure?: number;
};

/** 强调层：扁平矢量文字（DOM）。保留人类明确说喜欢的「末尾弹出」方式。 */
export type OverlaySpec = {
  kicker?: string;
  title: string;
  bullets?: string[];
  /** 入场秒数；缺省 = 时长的 55% */
  enterAt?: number;
};

export type ShotSpec = {
  id: string;
  durationInFrames: number;
  fps: 30 | 60;
  layout: LayoutName;
  variant: Variant;
  theme: ThemeName;
  env: EnvSpec;
  content: LayoutContent;
  overlay?: OverlaySpec;
  /**
   * 仅供验收：设为 "solid" 时整块屏幕画成纯品红，
   * 配合 check-overflow.py 精确数「内容有没有溢出屏幕」。
   * 夜景照片里不可能出现这个颜色，所以不会误判。
   */
  debug?: "solid";
};

// ---------------------------------------------------------------------------
// 运行时校验
// ---------------------------------------------------------------------------

const LAYOUTS: LayoutName[] = ["doc", "chart"];
const THEMES: ThemeName[] = ["light", "deep-blue", "warm-sand", "cool-teal"];

/**
 * JSON 进不了 TypeScript 的类型系统，所以在入口处挡一道。
 * 宁可启动就报错，也不要渲到一半发现某个字段是 undefined 然后画面缺一块。
 */
export function validateSpec(raw: unknown): ShotSpec {
  const fail = (msg: string): never => {
    throw new Error(`[shot spec] ${msg}\n实际内容: ${JSON.stringify(raw).slice(0, 400)}`);
  };
  if (typeof raw !== "object" || raw === null) fail("spec 不是对象");
  const s = raw as Record<string, any>;

  if (typeof s.id !== "string" || !s.id) fail("id 必须是非空字符串");
  if (!Number.isInteger(s.durationInFrames) || s.durationInFrames <= 0) fail("durationInFrames 必须是正整数");
  if (s.fps !== 30 && s.fps !== 60) fail("fps 只能是 30 或 60");
  if (!LAYOUTS.includes(s.layout)) fail(`layout 必须是 ${LAYOUTS.join(" / ")}`);
  if (![0, 1, 2].includes(s.variant)) fail("variant 只能是 0 / 1 / 2");
  if (!THEMES.includes(s.theme)) fail(`theme 必须是 ${THEMES.join(" / ")}`);

  const env = s.env;
  if (!env || typeof env !== "object") fail("env 缺失");
  if (typeof env.src !== "string" || !env.src) fail("env.src 必须是字符串");
  if (!Array.isArray(env.quad) || env.quad.length !== 4) fail("env.quad 必须是 4 个点");
  for (const p of env.quad) {
    if (!Array.isArray(p) || p.length !== 2 || !p.every((n: unknown) => typeof n === "number")) {
      fail("env.quad 的每个点必须是 [number, number]");
    }
  }
  if (typeof env.cornerRadius !== "number" || env.cornerRadius < 0) fail("env.cornerRadius 必须是非负数");

  const c = s.content;
  if (!c || typeof c !== "object") fail("content 缺失");
  if (c.kind !== s.layout) fail(`content.kind (${c.kind}) 必须与 layout (${s.layout}) 一致`);
  if (typeof c.heading !== "string" || !c.heading) fail("content.heading 必须是非空字符串");

  if (c.kind === "doc") {
    if (!Array.isArray(c.paragraphs) || c.paragraphs.length === 0) fail("doc.paragraphs 必须是非空数组");
  } else {
    if (!Array.isArray(c.series) || c.series.length < 3) fail("chart.series 至少 3 条");
    if (!c.metric || typeof c.metric.value !== "number") fail("chart.metric.value 必须是数字");
  }

  return s as ShotSpec;
}

/** spec 里缺省字段的最终取值 —— 版式代码只从这里取默认值，不各自写一份 */
export function resolveEnv(env: EnvSpec) {
  return { exposure: 1.14, ...env };
}

/** 强调层入场时刻（秒） */
export function resolveOverlayAt(spec: ShotSpec): number {
  const total = spec.durationInFrames / spec.fps;
  return spec.overlay?.enterAt ?? total * 0.68;
}
