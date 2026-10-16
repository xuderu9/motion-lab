// 「虚拟摄影棚」实验区 —— 独立入口，不影响现有 src/
//
// 渲染：
//   npx remotion render studio/index.ts StudioProof out/studio-proof.mp4 --concurrency=1
//   npx remotion render studio/index.ts LiveUI     out/liveui.mp4      --concurrency=1
// 单帧：
//   npx remotion still  studio/index.ts StudioProof out/studio-still.png --frame=300
//
// 注意：本文件是 .ts，不能写 JSX；合成表在 ./Root.tsx。

import { registerRoot } from "remotion";
import { Root } from "./Root";

registerRoot(Root);
