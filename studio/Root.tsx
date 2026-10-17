import React from "react";
import { LiveUIRoot } from "./LiveUI";
import { CompositeRoot } from "./Composite";

/**
 * studio 实验区的合成总表
 *
 * 手搓 3D 场景（原 StudioProof / Room）已归档到 ./_archive-3d/，
 * 被 Composite（即梦背景板 + 单应贴合的活体界面）取代，不再参与构建。
 */
export const Root: React.FC = () => (
  <>
    <LiveUIRoot />
    <CompositeRoot />
  </>
);
