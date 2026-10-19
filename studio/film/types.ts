// 转场类型 —— Film 的时间轴接线只认这两个类型。
//
// 关键不变量：转场**不改变总时长**。做法沿用 Film 现有的「后一个镜头提前 k 帧开始」
// 模型，k 由 TransitionSpec.frames 给出；这里只描述「在第几个镜头之后」和「用什么效果」。

/** 全部可用的转场 id；`cut` = 硬切（用于显式压掉某个边界的 fade/转场） */
export type TransitionId =
  | "matchCut"
  | "liquidMorph"
  | "shatter"
  | "shapeMask"
  | "glitch"
  | "stroke"
  | "seamlessZoom"
  | "whipPan"
  | "perspectivePull"
  | "lightLeak"
  | "pageCurl"
  | "pixelate"
  | "cut";

/** 一个边界上的转场配置 */
export type TransitionSpec = {
  /** 第几个镜头之后（0-based）。afterShot: 0 = 第 1、2 个镜头之间 */
  afterShot: number;
  id: TransitionId;
  /** 重叠帧数；缺省 14。最少按 2 帧处理 */
  frames?: number;
};

/** 缺省重叠帧数 */
export const DEFAULT_TRANSITION_FRAMES = 14;
