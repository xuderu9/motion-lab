// 四套主题 token。
//
// 分工：themes.ts 由 M1 交付，M2 只消费不改 token。
// 版式内部**禁止**出现任何 `#rrggbb` 或 `rgba(...)` 字面量 —— 换主题时必须零改动。
//
// 亮度约束（M1 验收第 3 条）：
//   整片平均 105 ± 12，且亮页帧 ≥110、暗页帧 ≥94。
// 因为屏幕只占全帧 9.38%，屏外区（曝光 1.10 后）≈100.1，
// 所以 整帧 ≈ 0.0938×屏内 + 0.9062×100.1：
//   · 亮主题屏内 ~235 → 整帧 ~112.7  ✓ ≥110
//   · 暗主题屏内 ~50  → 整帧 ~95.4  ✓ ≥94
// 暗主题**不能**把背景压到接近纯黑，否则暗页帧会跌破下限。

import type { Theme, ThemeName } from "./types";

/** 浅色：主力。参考片整帧 109.3，靠它把整片亮度拉到目标区间。 */
const light: Theme = {
  name: "light",
  isLight: true,
  bg: ["#f4f6f9", "#e9edf3"],
  panel: "rgba(16,32,52,0.045)",
  panelStrong: "rgba(16,32,52,0.065)",
  panelBorder: "rgba(16,32,52,0.11)",
  text: "#16222f",
  textDim: "rgba(22,34,47,0.64)",
  textFaint: "rgba(22,34,47,0.40)",
  accent: "#1f6fe0",
  accent2: "#0e8f74",
  accentSoft: "rgba(31,111,224,0.13)",
  grid: "rgba(16,32,52,0.10)",
  shadow: "rgba(16,32,52,0.12)",
  chromeBg: "rgba(22,38,58,0.055)",
};

/** 深蓝：参考片里那块深板岩蓝 #203448 的数字化版本。 */
const deepBlue: Theme = {
  name: "deep-blue",
  isLight: false,
  bg: ["#12233a", "#0a1421"],
  panel: "rgba(255,255,255,0.055)",
  panelStrong: "rgba(255,255,255,0.085)",
  panelBorder: "rgba(255,255,255,0.13)",
  text: "#eef3fa",
  textDim: "rgba(202,218,240,0.70)",
  textFaint: "rgba(202,218,240,0.44)",
  accent: "#4f93ff",
  accent2: "#38d6a8",
  accentSoft: "rgba(79,147,255,0.22)",
  grid: "rgba(255,255,255,0.09)",
  shadow: "rgba(0,0,0,0.55)",
  chromeBg: "rgba(255,255,255,0.06)",
};

/** 暖砂：纸感。适合人文/历史/综述类口播。 */
const warmSand: Theme = {
  name: "warm-sand",
  isLight: true,
  bg: ["#faf6ee", "#f1e9da"],
  panel: "rgba(74,56,30,0.05)",
  panelStrong: "rgba(74,56,30,0.075)",
  panelBorder: "rgba(74,56,30,0.14)",
  text: "#2e2415",
  textDim: "rgba(46,36,21,0.66)",
  textFaint: "rgba(46,36,21,0.40)",
  accent: "#b8621b",
  accent2: "#3f7d6a",
  accentSoft: "rgba(184,98,27,0.14)",
  grid: "rgba(74,56,30,0.11)",
  shadow: "rgba(74,56,30,0.14)",
  chromeBg: "rgba(74,56,30,0.06)",
};

/** 冷青：深色变体，用来和 light 打明暗节奏（参考片就是明暗交替的）。 */
const coolTeal: Theme = {
  name: "cool-teal",
  isLight: false,
  bg: ["#0f2b2c", "#081a1b"],
  panel: "rgba(190,255,244,0.06)",
  panelStrong: "rgba(190,255,244,0.095)",
  panelBorder: "rgba(150,240,225,0.16)",
  text: "#e8fbf7",
  textDim: "rgba(190,236,230,0.70)",
  textFaint: "rgba(190,236,230,0.42)",
  accent: "#2ee0b8",
  accent2: "#7fb7ff",
  accentSoft: "rgba(46,224,184,0.20)",
  grid: "rgba(190,255,244,0.09)",
  shadow: "rgba(0,0,0,0.50)",
  chromeBg: "rgba(190,255,244,0.06)",
};

export const THEMES: Record<ThemeName, Theme> = {
  light,
  "deep-blue": deepBlue,
  "warm-sand": warmSand,
  "cool-teal": coolTeal,
};

export const THEME_NAMES: ThemeName[] = ["light", "deep-blue", "warm-sand", "cool-teal"];

/** 亮 / 暗主题清单，供分镜规划器做明暗节奏约束 */
export const LIGHT_THEMES: ThemeName[] = THEME_NAMES.filter((n) => THEMES[n].isLight);
export const DARK_THEMES: ThemeName[] = THEME_NAMES.filter((n) => !THEMES[n].isLight);

export function getTheme(name: ThemeName): Theme {
  const t = THEMES[name];
  if (!t) throw new Error(`[theme] 未知主题: ${name}（可用: ${THEME_NAMES.join(", ")}）`);
  return t;
}
