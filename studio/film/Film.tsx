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
import { AbsoluteFill, Composition, Sequence, useCurrentFrame } from "remotion";
import type { CalculateMetadataFunction } from "remotion";
import { ShotRenderer } from "../shot/ShotRenderer";
import type { ShotSpec } from "../shot/types";
import { FRAME_H, FRAME_W } from "../shot/types";

export type FilmProps = {
  /** 与 plan.json 的 shots 字段同构，所以 plan.json 可以直接当 props 用 */
  shots: ShotSpec[];
  /** 交叉淡化帧数；0 = 全部硬切 */
  fade?: number;
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

export const Film: React.FC<FilmProps> = ({ shots, fade = 0 }) => {
  if (!shots.length) return <AbsoluteFill style={{ background: "#000" }} />;
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
