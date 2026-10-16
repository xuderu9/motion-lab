# MotionLab - 电影级解说视频引擎

## 快速开始

```powershell
cd D:\codex2\REMOTIONAI2\motion-lab

npm install           # 安装依赖（必须在本地，不要云端）
npm run dev           # 打开 http://localhost:3000 在 Studio 里预览 DemoVideo
npm run render        # 渲染成片 → out\demo.mp4

npm run typecheck     # 类型检查（提交前必跑，必须 0 报错）
```

> **渲染慢十倍的话**：检查 `remotion.config.ts` 里的
> `Config.setChromiumOpenGlRenderer("angle")` 是否还在。
> 走软件光栅化时 30s/1080p 要 418s，走硬件只要约 29s。详见 `TASK-KIMI-PERFORMANCE.md`。

视频内容全部由 `src/data/demo-spec.json` 的一份 JSON 描述驱动，
改 JSON 就能改片子，不需要动组件代码。

## 项目结构

```
motion-lab/
├── src/
│   ├── components/
│   │   ├── 3d/              # 3D 场景
│   │   │   ├── RotatingEarth.tsx      # 旋转地球（对外组件）
│   │   │   ├── earth/                 # 地球的真实实现
│   │   │   │   ├── EarthScene.tsx        # 地表/云层/大气/灯光/星空总装
│   │   │   │   ├── proceduralEarth.ts    # 程序化 PBR 贴图（albedo/rough/metal/bump/云/夜灯）
│   │   │   │   ├── Starfield.tsx         # 确定性星空
│   │   │   │   ├── CameraRig.tsx         # 镜头运动（push-in / orbit ...）
│   │   │   │   └── PostFX.tsx            # Bloom / Vignette / 景深
│   │   │   └── CardStack3D.tsx        # 3D 卡片扇面展开
│   │   ├── charts/          # 数据图表
│   │   │   ├── SmoothLineChart.tsx    # 丝滑折线图（Catmull-Rom）
│   │   │   ├── BarChart.tsx           # 柱状图（生长动画）
│   │   │   ├── ComparisonChart.tsx    # 对比图（左右对比）
│   │   │   └── DonutChart.tsx         # 环形图（旋转填充）
│   │   ├── particles/       # 粒子系统
│   │   │   └── Fireflies.tsx          # 萤火虫效果
│   │   ├── text/            # 文字动效
│   │   │   └── CinematicTitle.tsx     # 电影级标题
│   │   ├── transitions/     # 转场特效
│   │   │   ├── GlitchEffect.tsx       # 故障风转场
│   │   │   └── MotionBlur.tsx         # 运动模糊
│   │   ├── rve/             # RVE 模板（从 reactvideoeditor.com 整合）
│   │   │   ├── animated-text.tsx
│   │   │   ├── card-flip.tsx
│   │   │   ├── liquid-wave.tsx
│   │   │   ├── matrix-rain.tsx
│   │   │   └── noise-grain.tsx
│   │   └── AudioSync.tsx    # 字幕同步显示
│   ├── schema/
│   │   └── video-spec.ts    # Zod 数据校验
│   ├── utils/
│   │   └── catmull-rom.ts   # Catmull-Rom 曲线插值
│   ├── data/
│   │   └── demo-spec.json   # Demo 数据（OPC 政策追踪）
│   ├── VideoRenderer.tsx    # 视频渲染器
│   ├── Root.tsx             # Composition 注册
│   └── index.ts             # 入口
├── package.json
├── tsconfig.json
└── remotion.config.ts
```

## 核心特性

1. **镜头语言驱动**：不是卡片流，是镜头在场景中运动
2. **真动 > 假动**：3D 自转、丝滑曲线、粒子飘动
3. **数据驱动**：一份 JSON 描述视频全部内容
4. **音频同步**：动效跟着字幕/语音同步

### 3D 地球（游戏级画面）

- **PBR 材质**：6 张程序化贴图（albedo / roughness / metalness / bump / 云层 / 夜景灯光），
  3D 噪声采样球面坐标，**没有经度接缝**
- **光照**：太阳主光 + 半球补光 + 轮廓光 + 现场生成的 PMREM 环境贴图（**不下载任何 HDRI**）
- **大气散射**：自定义 GLSL 径向散射，向阳侧发光、背阳侧熄灭
- **云层与夜景**：云比地表多转 22% 产生视差；背光面显示城市灯光
- **后处理**：Bloom + Vignette（可选景深）
- **确定性**：全部随机数走固定种子、全部动画由帧号推导，
  同一帧重复渲染**逐字节一致**（可复现、不闪烁）

## 依赖

- `remotion` - 视频渲染引擎
- `@remotion/three` - Three.js 3D 集成
- `remotion-bits` - 动画组件库
- `three` + `@react-three/fiber` + `@react-three/drei` - 3D 渲染
- `zod` - 数据校验

## 技术栈

- **3D 渲染**：@remotion/three（Three.js）
- **图表**：SVG + Catmull-Rom + spring 动画
- **粒子**：remotion-bits Particles
- **转场**：自定义 Glitch/MotionBlur
- **数据**：Zod 校验 JSON spec

## 下一步

- 整合更多 RVE 模板
- 添加更多 3D 场景（立方体、数据可视化 3D）
- 完善音频同步（音频能量检测）
- 添加预渲染素材支持

## 参考

- [架构设计文档](../architecture.md)
- [Remotion 官方文档](https://www.remotion.dev/docs)
- [remotion-bits 文档](https://remotion-bits.dev/docs)
- [RVE 模板库](https://www.reactvideoeditor.com/remotion-templates)
