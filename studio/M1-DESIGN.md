# M1 设计：镜头模板组件化 + 声明式渲染器

> 目标：把现在硬编码的 `Composite.tsx` 变成「**一个镜头 = 一份 JSON**」。
> 这份文档是 M1 的施工图，也是验收依据。

---

## 1. 为什么要做这一步

现在 `LiveUI.tsx` 574 行里，3 个版面、配色、排布、内容全部硬编码。
后面要做 **6 版式 × 3 变体 × 4 主题 = 72 种视觉组合**，如果照现在的方式写，就是 72 份重复代码。

**声明式改造后：1 个渲染器 + 72 份数据。**

这条是"一周内做完"的前提。如果不做，M2 会从 1.5 天变成 10 天。

---

## 2. 数据结构

```ts
// 一个镜头 = 一份 spec
type ShotSpec = {
  id: string;
  durationInFrames: number;
  fps: 30 | 60;

  // 视觉组合（由 M3 的分镜规划器分配，M1 阶段手写）
  layout: "chart" | "doc" | "code" | "map" | "timeline" | "cards";
  variant: 0 | 1 | 2;                    // 同版式的第 1/2/3 种排布
  theme: "deep-blue" | "light" | "warm-sand" | "cool-teal";

  // 环境层（背景板）
  env: {
    src: string;                         // public/plates/xxx.png
    quad: [number, number][];            // TL TR BR BL，1920 坐标系
    cornerRadius: number;                // 画布空间圆角
    exposure?: number;                   // 提亮系数，默认 1
  };

  // 内容层（各版式自己的数据，结构由 layout 决定）
  content: LayoutContent;

  // 强调层（扁平矢量文字，可选）
  overlay?: {
    kicker?: string;
    title: string;
    bullets?: string[];
    enterAt?: number;                    // 秒；缺省 = 时长的 55%
  };
};
```

`LayoutContent` 按 layout 分支，例如：

```ts
type ChartContent = {
  kind: "chart";
  heading: string;
  series: { label: string; value: number }[];
  mode: "line" | "bar" | "rank-race";
  unit?: string;
};

type DocContent = {
  kind: "doc";
  heading: string;
  subtitle?: string;
  paragraphs: string[];       // 逐行滚动
  sidebar?: { title: string; bars: number[] };
};

// code / map / timeline / cards 同理，M2 时逐个定
```

---

## 3. 组件结构

```
<ShotRenderer spec={shot} />
├─ <EnvLayer src quad exposure />          ← 背景板（静帧，M6 烘焙点）
├─ <ScreenLayer quad cornerRadius theme>   ← 单应变换容器
│    └─ <LayoutBody layout variant theme content t />   ← canvas 绘制
└─ <OverlayLayer overlay t />              ← 扁平矢量文字（DOM）
```

### 关键设计点

**3.1 每层独立可替换**
这是烘焙（M6）的前提：`EnvLayer` 已经是静帧；将来 `ScreenLayer` 里没有逐帧变化的部分
可以预渲染成 PNG 序列，只在有动画的镜头上走实时 canvas。

**3.2 版面主体统一签名**

```ts
type LayoutDraw = (
  g: CanvasRenderingContext2D,
  t: number,                 // 秒
  content: LayoutContent,
  theme: Theme,
  variant: number,
) => void;
```

和现有 `draw(g, frame, fps)` 的精神一致，只是把"内容"和"主题"提成参数。

**3.3 主题是一组 token，不是散落的颜色**

```ts
type Theme = {
  bg: [string, string];       // 渐变起止
  panel: string;              // 面板底色
  panelBorder: string;
  text: string;
  textDim: string;
  accent: string;
  accent2: string;
  isLight: boolean;           // 决定文字反色、阴影方向
};
```

四套主题（`deep-blue` / `light` / `warm-sand` / `cool-teal`）。
**注意**：参考片是亮调片（整帧 109），所以至少要有一套 `light` 主题做主用。

**3.4 变体只改排布，不重写绘制**

```ts
// 同一版式的三个变体，共享面板/图表/文本的基础绘制
const CHART_VARIANTS: LayoutDraw[] = [chartFullBleed, chartSplitLeft, chartRankRace];
```

**3.5 外壳复用**
顶栏、面板圆角框、图标、滚动条、扫描线、掠光这些已经在 `LiveUI.tsx` 里写好了，
抽成 `chrome.ts` 供所有版式调用。

---

## 4. 文件规划

```
studio/
├─ shot/
│  ├─ types.ts          ← ShotSpec / Theme / LayoutContent 类型
│  ├─ themes.ts         ← 四套主题 token
│  ├─ chrome.ts         ← 共享外壳绘制（顶栏/面板/图表/文本/滚动）
│  ├─ ShotRenderer.tsx  ← 三层容器 + 单应变换 + 圆角裁剪
│  ├─ EnvLayer.tsx
│  ├─ ScreenLayer.tsx
│  ├─ OverlayLayer.tsx
│  └─ layouts/
│     ├─ index.ts       ← layout × variant → LayoutDraw 的分发表
│     ├─ chart.ts       ← 3 个变体
│     ├─ doc.ts         ← 3 个变体（现有 LiveUI 的浅色页迁过来做 variant 0）
│     └─ ...            ← M2 时补 code/map/timeline/cards
├─ shots/
│  └─ demo-3.json       ← M1 验收用：3 个视觉明显不同的镜头
└─ tools/
   └─ check-shot.py     ← 一条命令跑完所有指标，输出 PASS/FAIL 表
```

`LiveUI.tsx` 保留为"参考实现"，M2 结束时删除。

---

## 5. 验收标准（先写，后做）

**M1 通过的条件，缺一条不算完成：**

| # | 指标 | 判据 | 怎么测 |
|---|---|---|---|
| 1 | 声明式 | 同一份组件代码，**只改 JSON** 渲出 3 个视觉明显不同的镜头 | 3 张静帧两两像素差 >30% |
| 2 | 溢出 | 每个镜头 **0 像素**溢出屏幕 | 品红探针 + `check-overflow.py` |
| 3 | 亮度 | 整帧平均亮度 **105 ± 12** | `signalstats YAVG` |
| 4 | 冻结 | 最长连续冻结 **< 0.3 秒** | 帧差扫描 |
| 5 | 可读 | 屏幕内正文有效字号 **≥ 10px** | `设计字号 × (屏幕宽 / 画布宽)`，算术验算 |
| 6 | 批量 | 3 个镜头用**一条命令**渲出 | `render-batch.ps1` |
| 7 | 检查器 | `check-shot.py` 输出 PASS/FAIL 表 | 直接跑 |

**第 1 条是 M1 的灵魂** —— 如果改 JSON 渲不出明显不同的画面，说明抽象没做对，必须返工。

---

## 6. 三个必须避开的设计陷阱

1. **不要把 variant 做成"换颜色"**
   变体必须是**排布变化**（全屏 / 左右分栏 / 网格），否则 72 种组合看起来还是 6 种。

2. **不要让 layout 直接读 theme 里的具体色值**
   一律通过 token 取，否则换主题要改绘制代码。

3. **不要在版面里硬编码文案**
   `content` 里没有的字符串一律不许出现，否则 M3 的分镜规划器没法换数据。

---

## 7. 顺序

1. `types.ts` + `themes.ts` + `chrome.ts`（抽公共部分）
2. `ShotRenderer` + 三个 Layer（把现有 Composite 迁过来）
3. `layouts/doc.ts` 的 3 个变体（最快的验证路径 —— 现有的浅色页就是 variant 0）
4. `layouts/chart.ts` 的 3 个变体
5. `demo-3.json` 三个镜头
6. `check-shot.py` + 批量渲染脚本
7. 跑验收，全过 → M1 完成，交 Codex 做 M2
