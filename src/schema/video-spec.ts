import { z } from "zod";

// ==================== 基础类型 ====================

export const PositionSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  z: z.number().default(0),
});

export const ScaleSchema = z.object({
  x: z.number().default(1),
  y: z.number().default(1),
  z: z.number().default(1),
});

export const RotationSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  z: z.number().default(0),
});

// ==================== 动效类型 ====================

export const EnterAnimationSchema = z.object({
  type: z.enum(["fade", "slide", "scale", "3d-fly-in"]).default("fade"),
  duration: z.number().min(0).max(5).default(0.5),
  delay: z.number().min(0).default(0),
  easing: z.enum(["spring", "ease-out", "ease-in-out", "linear"]).default("spring"),
});

export const LoopAnimationSchema = z.object({
  type: z.enum(["rotate", "pulse", "float", "custom"]).default("rotate"),
  duration: z.number().min(0.1).default(3),
  repeat: z.boolean().default(true),
});

export const AnimationSchema = z.object({
  enter: EnterAnimationSchema.optional(),
  exit: EnterAnimationSchema.optional(),
  loop: LoopAnimationSchema.optional(),
});

// ==================== 音频同步 ====================

export const AudioSyncSchema = z.object({
  triggerAt: z.number().min(0).optional(),
  followSubtitle: z.boolean().default(false),
  syncType: z.enum(["on-word", "on-sentence", "free"]).default("on-sentence"),
});

// ==================== 相机 ====================

export const CameraMotionSchema = z.object({
  type: z.enum(["push-in", "pull-out", "pan-left", "pan-right", "orbit", "static"]).default("static"),
  duration: z.number().min(0).default(0),
  easing: z.enum(["spring", "ease-in-out", "linear"]).default("ease-in-out"),
});

export const CameraSchema = z.object({
  position: PositionSchema.default({ x: 0, y: 0, z: 100 }),
  rotation: RotationSchema.default({ x: 0, y: 0, z: 0 }),
  motion: CameraMotionSchema.optional(),
  depthOfField: z.object({
    focusDistance: z.number().default(100),
    aperture: z.number().default(2.8),
    focalLength: z.number().default(50),
  }).optional(),
});

// ==================== 转场 ====================

export const TransitionSchema = z.object({
  type: z.enum(["fade-to-black", "fade-through-white", "slide-left", "slide-right", "zoom", "glitch"]).default("fade-to-black"),
  duration: z.number().min(0).max(2).default(0.5),
});

// ==================== 元素 ====================

export const ElementSchema = z.object({
  id: z.string(),
  type: z.enum(["3d-scene", "chart", "text", "asset", "particle"]),
  component: z.string(),
  position: PositionSchema.default({ x: 0, y: 0, z: 0 }),
  scale: ScaleSchema.default({ x: 1, y: 1, z: 1 }),
  rotation: RotationSchema.default({ x: 0, y: 0, z: 0 }),
  data: z.any().default({}),
  animation: AnimationSchema.optional(),
  sync: AudioSyncSchema.optional(),
});

// ==================== 字幕 ====================

export const SubtitleSchema = z.object({
  text: z.string(),
  start: z.number().min(0),
  end: z.number().min(0),
});

// ==================== 音频轨道 ====================

export const AudioTrackSchema = z.object({
  url: z.string().optional(),
  subtitles: z.array(SubtitleSchema).default([]),
});

// ==================== 镜头 ====================

export const ShotSchema = z.object({
  id: z.string(),
  startTime: z.number().min(0),
  duration: z.number().min(0.1),
  // Zod 4：.default() 要求传入「输出类型」，而这里想给的是「输入」默认值（{}，
  // 由内部 position/rotation 的 default 补齐），所以要用 .prefault()
  camera: CameraSchema.prefault({}),
  elements: z.array(ElementSchema).default([]),
  transition: TransitionSchema.optional(),
});

// ==================== 视频规范 ====================

export const VideoSpecSchema = z.object({
  title: z.string(),
  duration: z.number().min(1),
  resolution: z.object({
    width: z.number().int().min(100).default(1920),
    height: z.number().int().min(100).default(1080),
  }).default({ width: 1920, height: 1080 }),
  fps: z.number().int().min(1).max(60).default(30),
  audio: AudioTrackSchema.default({ subtitles: [] }),
  shots: z.array(ShotSchema),
});

export type VideoSpec = z.infer<typeof VideoSpecSchema>;
/**
 * 输入类型：带 .default() 的字段在输入侧是可选的。
 *
 * Remotion 的 <Composition /> 在传入 schema 时，defaultProps / component 的
 * props 必须使用「输入类型」（见 remotion 的 props-if-has-props.d.ts），
 * 因此组件内部需要用 VideoSpecSchema.parse(props) 补齐默认值。
 */
export type VideoSpecInput = z.input<typeof VideoSpecSchema>;
export type Shot = z.infer<typeof ShotSchema>;
export type Element = z.infer<typeof ElementSchema>;
export type Camera = z.infer<typeof CameraSchema>;
export type Subtitle = z.infer<typeof SubtitleSchema>;
