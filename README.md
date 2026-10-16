# MotionLab - 电影级解说视频引擎

## 快速开始

```bash
# 1. 解压项目
tar -xzf motion-lab-v1.tar.gz
cd motion-lab

# 2. 安装依赖（必须在本地电脑，不要云端）
npm install

# 3. 启动预览
npm run dev

# 4. 浏览器打开 http://localhost:3000，选择 DemoVideo 预览

# 5. 渲染视频
npm run render
```

## 项目结构

```
motion-lab/
├── src/
│   ├── components/
│   │   ├── 3d/              # 3D 场景
│   │   │   ├── RotatingEarth.tsx      # 旋转地球（程序化生成）
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
