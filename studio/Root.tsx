import React from "react";
import { LiveUIRoot } from "./LiveUI";
import { CompositeRoot } from "./Composite";
import { ShotRoot } from "./shot/ShotRenderer";
import { FilmRoot } from "./film/Film";

/**
 * studio 合成总表
 *
 * 手搓 3D 场景（原 StudioProof / Room）已归档到 ./_archive-3d/
 *
 * Shot       ← M1 的声明式渲染器：一个镜头 = 一份 JSON（studio/shots/demo.json）
 * Composite  ← M1 之前的硬编码版本，保留为回归对照，M2 结束时删除
 * LiveUI     ← LiveUI 参考实现，M2 结束时删除
 */
export const Root: React.FC = () => (
  <>
    <FilmRoot />
    <ShotRoot />
    <CompositeRoot />
    <LiveUIRoot />
  </>
);
