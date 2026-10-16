// 「虚拟摄影棚」技术验证 —— 独立入口，不影响现有 src/
//
// 渲染：
//   npx remotion render studio/index.ts StudioProof out/studio-proof.mp4
// 单帧：
//   npx remotion still studio/index.ts StudioProof out/studio-still.png --frame=240

import { registerRoot } from "remotion";
import { StudioRoot } from "./StudioProof";

registerRoot(StudioRoot);
