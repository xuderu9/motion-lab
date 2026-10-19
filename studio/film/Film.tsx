// M4 成片合成：把 plan.json 里的 N 个镜头拼成一条片子。
//
// 为什么用 Remotion 的 <Sequence> 而不是「渲 N 个 mp4 再用 ffmpeg concat」：
//   · concat 只能在镜头边界上做硬切，做不了转场
//   · concat 要重新编码一次，多一代画质损失
//   · 单条时间轴才能保证「总时长 == 各镜头时长之和」这个不变量
//
// 关于转场：**参考片 161 秒只有 11 次硬切，没有任何转场**（实测）。
// 所以默认 cut。需要交叉淡化时传 fade（帧数），实现方式是让**后一个镜头提前 k 帧开始**
// 并在前 k 帧淡入；前一个镜头保持原有范围淡出。总时长不变，因为时间轴没有位移。

import React from "react";
import { AbsoluteFill, Composition, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import type { CalculateMetadataFunction } from "remotion";
import { ShotRenderer } from "../shot/ShotRenderer";
import type { ShotSpec } from "../shot/types";
import { FRAME_H, FRAME_W } from "../shot/types";
import { DEFAULT_TRANSITION_FRAMES } from "./types";
import type { TransitionId, TransitionSpec } from "./types";
import { TransitionLayer, isOutOnTop } from "./transitions";

export type FilmProps = {
  /** 与 plan.json 的 shots 字段同构，所以 plan.json 可以直接当 props 用 */
  shots: ShotSpec[];
  /** 交叉淡化帧数；0 = 全部硬切 */
  fade?: number;
  /**
   * 镜头边界上的转场。缺省 / 空数组 = 完全走原来的硬切 + fade 路径。
   * 每一项占一个边界（afterShot 0-based）；给出后该边界按 frames 提前开始，
   * 总时长仍然等于各镜头时长之和。
   */
  transitions?: TransitionSpec[];
};

/** 时间轴：第 i 个镜头的起始帧（不含淡化提前量） */
export function shotStarts(shots: ShotSpec[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const s of shots) {
    out.push(acc);
    acc += s.durationInFrames;
  }
  return out;
}

export function totalFrames(shots: ShotSpec[]): number {
  return shots.reduce((n, s) => n + s.durationInFrames, 0);
}

/** 单个镜头：负责淡入淡出，内容仍然是 ShotRenderer 画 */
const ShotSlot: React.FC<{
  spec: ShotSpec;
  fadeIn: number;
  fadeOut: number;
}> = ({ spec, fadeIn, fadeOut }) => {
  const f = useCurrentFrame();
  const dur = spec.durationInFrames + fadeIn; // 提前开始时，时长要加上提前量
  let opacity = 1;
  if (fadeIn > 0 && f < fadeIn) opacity = Math.min(opacity, f / fadeIn);
  if (fadeOut > 0 && f > dur - fadeOut) opacity = Math.min(opacity, (dur - f) / fadeOut);
  return (
    <AbsoluteFill style={{ opacity }}>
      <ShotRenderer spec={spec} />
    </AbsoluteFill>
  );
};

/**
 * 原来的成片逻辑，**一行都不改**。
 *
 * 这是「默认零变更」的落点：transitions 缺省时 Film 直接返回它。
 * 新增转场不得改变这条路径的输出（包括 fade 的提前量 / 淡入淡出曲线）。
 */
const LegacyFilm: React.FC<{ shots: ShotSpec[]; fade: number }> = ({ shots, fade }) => {
  const starts = shotStarts(shots);
  const k = Math.max(0, Math.round(fade));

  return (
    <AbsoluteFill style={{ backgroundColor: "#05080d" }}>
      {shots.map((spec, i) => {
        // 淡化时后一个镜头提前 k 帧开始；第一个镜头不提前
        const early = k > 0 && i > 0 ? k : 0;
        const from = Math.max(0, starts[i] - early);
        const dur = spec.durationInFrames + early;
        return (
          <Sequence key={spec.id} from={from} durationInFrames={dur} name={`shot-${i + 1}-${spec.layout}`}>
            <ShotSlot spec={spec} fadeIn={early} fadeOut={k > 0 && i < shots.length - 1 ? k : 0} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// 转场路径
//
// 每个边界（shot i 与 shot i+1 之间）解析成一个 Edge：
//   · transitions 里有这个边界 → 转场（k = frames）
//   · 没有但 fade > 0        → 沿用交叉淡化
//   · 都没有                 → 硬切
//
// 两个镜头在 [start_{i+1} - k, start_{i+1}) 内同时存在。第 i 个镜头的
// Sequence 从 start_i - inK 开始、长度 duration_i + inK，所以它刚好在
// start_{i+1} - 1 结束；第 i+1 个镜头在 overlap 的第一帧进场。总时长不变。
// ---------------------------------------------------------------------------

type Edge = {
  kind: "transition" | "fade";
  id: TransitionId;
  frames: number;
};

function resolveEdges(
  shots: ShotSpec[],
  transitions: TransitionSpec[],
  fadeK: number,
): (Edge | null)[] {
  const edges: (Edge | null)[] = [];
  for (let b = 0; b < shots.length - 1; b++) {
    let t: TransitionSpec | undefined;
    for (const candidate of transitions) {
      if (candidate.afterShot === b) t = candidate;
    }
    if (t) {
      if (t.id === "cut") {
        edges.push(null);
        continue;
      }
      const requested = Math.round(t.frames ?? DEFAULT_TRANSITION_FRAMES);
      if (requested <= 0) {
        edges.push(null);
        continue;
      }
      // 不允许一个边界吃掉整个镜头；相邻两个镜头各留一半以上给内容。
      const safe = Math.max(
        1,
        Math.min(requested, shots[b].durationInFrames, shots[b + 1].durationInFrames),
      );
      edges.push({ kind: "transition", id: t.id, frames: safe });
      continue;
    }
    if (fadeK > 0) {
      edges.push({ kind: "fade", id: "cut", frames: fadeK });
      continue;
    }
    edges.push(null);
  }
  return edges;
}

const TransitionShot: React.FC<{
  spec: ShotSpec;
  inEdge: Edge | null;
  outEdge: Edge | null;
  width: number;
  height: number;
}> = ({ spec, inEdge, outEdge, width, height }) => {
  const f = useCurrentFrame();
  const inK = inEdge?.frames ?? 0;
  const outK = outEdge?.frames ?? 0;
  const dur = spec.durationInFrames + inK;
  const outStart = dur - outK;

  // 只有 fade 边界改透明度；转场边界交给 TransitionLayer。
  let opacity = 1;
  if (inEdge?.kind === "fade" && inK > 0 && f < inK) opacity = Math.min(opacity, f / inK);
  if (outEdge?.kind === "fade" && outK > 0 && f >= outStart) {
    opacity = Math.min(opacity, (dur - f) / outK);
  }

  let content: React.ReactNode = <ShotRenderer spec={spec} />;

  const outActive = outEdge?.kind === "transition" && outK > 0 && f >= outStart;
  const inActive = inEdge?.kind === "transition" && inK > 0 && f < inK;

  if (outActive) {
    const p = outK <= 1 ? 1 : (f - outStart) / (outK - 1);
    content = (
      <TransitionLayer
        id={outEdge.id}
        p={p}
        side="out"
        width={width}
        height={height}
        frames={outK}
      >
        {content}
      </TransitionLayer>
    );
  }
  if (inActive) {
    const p = inK <= 1 ? 1 : f / (inK - 1);
    content = (
      <TransitionLayer
        id={inEdge.id}
        p={p}
        side="in"
        width={width}
        height={height}
        frames={inK}
      >
        {content}
      </TransitionLayer>
    );
  }

  return <AbsoluteFill style={{ opacity }}>{content}</AbsoluteFill>;
};

const TransitionFilm: React.FC<{
  shots: ShotSpec[];
  fade: number;
  transitions: TransitionSpec[];
}> = ({ shots, fade, transitions }) => {
  const starts = shotStarts(shots);
  const { width, height } = useVideoConfig();
  const fadeK = Math.max(0, Math.round(fade));
  const edges = resolveEdges(shots, transitions, fadeK);

  return (
    <AbsoluteFill style={{ backgroundColor: "#05080d" }}>
      {shots.map((spec, i) => {
        const inEdge = i > 0 ? edges[i - 1] ?? null : null;
        const outEdge = i < shots.length - 1 ? edges[i] ?? null : null;
        const inK = inEdge?.frames ?? 0;
        const from = Math.max(0, starts[i] - inK);
        const dur = spec.durationInFrames + inK;

        // 「出画在上面」的转场：把出画镜头的 Sequence 抬起。
        // 数值与 i 反向，保证两个相邻边界都抬的时候，先出画的仍在上面。
        const elevated = outEdge?.kind === "transition" && isOutOnTop(outEdge.id);

        return (
          <Sequence
            key={spec.id}
            from={from}
            durationInFrames={dur}
            name={`shot-${i + 1}-${spec.layout}`}
            style={elevated ? { zIndex: 1_000_000 - i } : undefined}
          >
            <TransitionShot
              spec={spec}
              inEdge={inEdge}
              outEdge={outEdge}
              width={width}
              height={height}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const Film: React.FC<FilmProps> = ({ shots, fade = 0, transitions }) => {
  if (!shots.length) return <AbsoluteFill style={{ background: "#000" }} />;
  // 没有转场配置 → 走完全原有的代码路径。
  if (!transitions || transitions.length === 0) return <LegacyFilm shots={shots} fade={fade} />;
  return <TransitionFilm shots={shots} fade={fade} transitions={transitions} />;
};

/**
 * 时长由 plan 推出来，不用手填。
 * 这就是「一份 plan.json 直接渲一条片子」的落点。
 */
const calculateFilmMetadata: CalculateMetadataFunction<FilmProps> = ({ props }) => {
  const shots = props.shots ?? [];
  const fps = shots[0]?.fps ?? 30;
  return {
    durationInFrames: Math.max(1, totalFrames(shots)),
    fps,
    width: FRAME_W,
    height: FRAME_H,
  };
};

/** 一份最简的默认 props，仅供 Studio 打开时预览（真渲时用 --props 覆盖） */
const PLACEHOLDER: FilmProps = {
  shots: [
    {
      id: "placeholder",
      durationInFrames: 150,
      fps: 30,
      layout: "doc",
      variant: 0,
      theme: "light",
      env: {
        src: "plates/desk-night.png",
        quad: [
          [468, 416],
          [946, 416],
          [1065, 777],
          [585, 849],
        ],
        cornerRadius: 76,
        exposure: 1.14,
      },
      content: {
        kind: "doc",
        heading: "用 --props 传入 plan.json",
        paragraphs: ["这条 Composition 需要一个 plan.json 才能渲出真内容。", "见 studio/film/README 或 check-film.py 的用法。"],
      },
    },
  ],
};

export const FilmRoot: React.FC = () => (
  <Composition
    id="Film"
    component={Film}
    calculateMetadata={calculateFilmMetadata}
    defaultProps={PLACEHOLDER}
    durationInFrames={150}
    fps={30}
    width={FRAME_W}
    height={FRAME_H}
  />
);
