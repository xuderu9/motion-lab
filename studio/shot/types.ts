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

// ---------------------------------------------------------------------------
// M2 版式内容（code / map / timeline / cards）
//
// 结构与 doc / chart 一致：**只描述数据**，不描述排布。
// 同一个 content 交给 3 个变体，会得到 3 种排布完全不同的画面。
// ---------------------------------------------------------------------------

/** 代码窗口：文件树 + 代码行 + 终端输出 */
export type CodeContent = {
  kind: "code";
  heading: string;
  subtitle?: string;
  breadcrumb?: string;
  /** 右上角标签，如 "TypeScript" */
  language?: string;
  /** 左侧文件树 / 顶部标签页 */
  files: { name: string; status?: "M" | "A" | "D" | "?" }[];
  /** 代码行。variant 0/1 直接按行绘制；缩进用前导空格表达 */
  code: string[];
  /** 终端输出行（variant 2 下半屏） */
  terminal?: string[];
  /** 底部状态栏右端文字 */
  statusRight?: string;
};

/** 地图上的一个地点，x/y 是 0~1 归一化坐标 */
export type MapPlace = { name: string; x: number; y: number; note?: string };

/** 地图航线：routes 用 places 的下标连接 */
export type MapContent = {
  kind: "map";
  heading: string;
  subtitle?: string;
  places: MapPlace[];
  routes: { from: number; to: number; label?: string }[];
  /** 左上/底部的读数，如 {label:"总里程", value:"3,142 km"} */
  stats?: { label: string; value: string }[];
};

/** 时间轴叙事：一组带时间的事件 */
export type TimelineContent = {
  kind: "timeline";
  heading: string;
  subtitle?: string;
  events: { time: string; title: string; body?: string; tag?: string }[];
};

/** 卡片素材墙 */
export type CardsContent = {
  kind: "cards";
  heading: string;
  subtitle?: string;
  cards: { title: string; body: string; tag: string; value?: string }[];
  /** 底部/轮播带上的标签 */
  tags?: string[];
};

// ---------------------------------------------------------------------------
// M5 全屏版式：标题卡 / 大数字 / 引用 / 氛围
//
// 这四个是参考片里占比最大、而我们完全没有的一类（见 out/ref-analysis）：
// 拆片 161 秒里约 30% 是纯氛围或大字卡，~40% 是全屏 UI/图表，
// 「画面里有个屏幕」只占 ~5%。所以这四个版式天生按整帧设计，
// 也允许被放进平板屏幕里（同一个函数、不同 size）。
// ---------------------------------------------------------------------------

/** 大字标题卡 */
export type TitleContent = {
  kind: "title";
  /** 主标题，最大的一行 */
  heading: string;
  /** 副标题 */
  subtitle?: string;
  /** 顶部小字，如「第三章」 */
  kicker?: string;
  /** 底部一行小字 */
  footnote?: string;
};

/** 单数字卡：一个数字撑满画面 */
export type StatContent = {
  kind: "stat";
  /** 数字本身，字符串，允许 "63%"、"1,200"、"3.2×" */
  value: string;
  /** 数字下面的一行说明 */
  label: string;
  /** 补充一行 */
  note?: string;
  /** 可选对比，如 "+12.4%" */
  delta?: string;
};

/** 引用卡 */
export type QuoteContent = {
  kind: "quote";
  /** 引文正文 */
  text: string;
  /** 出处 / 说话人 */
  attribution?: string;
  /** 顶部小字 */
  kicker?: string;
};

/** 纯氛围：没有信息，只给画面呼吸 */
export type AtmosphereContent = {
  kind: "atmosphere";
  /** 氛围类型 */
  mood: "starfield" | "gradient" | "grid" | "noise";
  /** 可选中置大字（参考片里多数氛围镜头没有字） */
  text?: string;
  /** 主色，缺省跟主题走 */
  accent?: string;
};

export type LayoutContent =
  | ChartContent
  | DocContent
  | CodeContent
  | MapContent
  | TimelineContent
  | CardsContent
  | TitleContent
  | StatContent
  | QuoteContent
  | AtmosphereContent;

// ---------------------------------------------------------------------------
// 版式分发表
// ---------------------------------------------------------------------------

/** M1 = doc | chart；M2 追加 code | map | timeline | cards；M5 追加四个「全屏」版式 */
export type LayoutName =
  | "doc"
  | "chart"
  | "code"
  | "map"
  | "timeline"
  | "cards"
  | "title"
  | "stat"
  | "quote"
  | "atmosphere";

/** 同版式的第 1/2/3 种**排布**（不是配色） */
export type Variant = 0 | 1 | 2;

/**
 * 版面渲染的画布尺寸。
 *
 * 老版式（doc/chart/code/map/timeline/cards）是按 1600×1200 硬写的，
 * 收不到这个参数也能画（默认就是 1600×1200）。
 * **新版式（title/stat/quote/atmosphere）必须用它**，
 * 因为同一条版式要同时能画在 1600×1200（平板屏幕里）和 1920×1080（整帧）上。
 */
export type LayoutSize = { w: number; h: number };

/**
 * 版面主体统一签名。
 *
 * 具体版式会在函数体内把 content 收窄成自己的类型，
 * 这样分发表可以是同构的 `LayoutDraw[][]`，而每个版式内部仍然是强类型的。
 *
 * `size` 是**可选尾参**：加法扩展，老版式不用改签名也能继续工作。
 */
export type LayoutDraw = (
  g: CanvasRenderingContext2D,
  t: number,
  content: LayoutContent,
  theme: Theme,
  variant: Variant,
  size?: LayoutSize,
) => void;

// ---------------------------------------------------------------------------
// 镜头 spec
// ---------------------------------------------------------------------------

/**
 * 呈现方式（M5 的另一个正交轴）。
 *
 * 拆参考片发现：161 秒里「画面里有个屏幕」只占 ~5%，是全片唯一的定场镜头；
 * ~40% 是全屏 UI/图表，~30% 是纯氛围/大字卡。所以「怎么呈现」必须独立于「用哪个版式」。
 *
 *   screen —— 房间里的平板（要单应变换贴合）。定场用，每片 2~3 次
 *   full   —— 画布直接铺满 1920×1080，不贴任何背景板
 *   plate  —— 深色底 + 悬浮卡片（参考片里「茶具/房间 + 卡片」那一类的简化版）
 */
export type Presentation = "screen" | "full" | "plate";

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
  /**
   * 呈现方式；缺省 = "screen"（向后兼容：M1/M2 的全部镜头 JSON 都不用改）。
   * full / plate 模式**不需要 env 的 quad 准确**，也不会去贴合背景板。
   */
  presentation?: Presentation;
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

const LAYOUTS: LayoutName[] = ["doc", "chart", "code", "map", "timeline", "cards"];
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

  switch (c.kind) {
    case "doc":
      if (!Array.isArray(c.paragraphs) || c.paragraphs.length === 0) fail("doc.paragraphs 必须是非空数组");
      break;
    case "chart":
      if (!Array.isArray(c.series) || c.series.length < 3) fail("chart.series 至少 3 条");
      if (!c.metric || typeof c.metric.value !== "number") fail("chart.metric.value 必须是数字");
      break;
    case "code":
      if (!Array.isArray(c.code) || c.code.length === 0) fail("code.code 必须是非空数组");
      if (!Array.isArray(c.files) || c.files.length === 0) fail("code.files 必须是非空数组");
      break;
    case "map":
      if (!Array.isArray(c.places) || c.places.length < 2) fail("map.places 至少 2 个");
      if (!Array.isArray(c.routes) || c.routes.length < 1) fail("map.routes 至少 1 条");
      for (const r of c.routes) {
        if (!c.places[r.from] || !c.places[r.to]) fail("map.routes 的下标越界");
      }
      break;
    case "timeline":
      if (!Array.isArray(c.events) || c.events.length < 2) fail("timeline.events 至少 2 条");
      break;
    case "cards":
      if (!Array.isArray(c.cards) || c.cards.length < 3) fail("cards.cards 至少 3 张");
      break;
    default:
      fail(`未知的 content.kind: ${String(c.kind)}`);
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
