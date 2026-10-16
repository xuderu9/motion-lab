import React from "react";
import { StudioRoot } from "./StudioProof";
import { LiveUIRoot } from "./LiveUI";

/** studio 实验区的合成总表 */
export const Root: React.FC = () => (
  <>
    <StudioRoot />
    <LiveUIRoot />
  </>
);
