# MotionLab - 游戏级视频渲染引擎

> 面向 AI Agent 的视频渲染系统，基于 Remotion 4.0.535

## 🎯 项目目标

实现**游戏级画面质感**的视频渲染引擎，支持：
- 3D 场景（PBR 材质、复杂光照、后处理）
- 数据可视化（丝滑图表、动态效果）
- 文字动效（电影级标题、打字机效果）
- 转场特效（粒子爆炸、渐变转场、故障风）
- 音频同步（字幕时间戳驱动动效）

## 📦 当前状态

### ✅ 已完成（架构层）

1. **核心架构**：
   - ✅ MotionLab 项目结构
   - ✅ Zod schema 数据校验
   - ✅ VideoRenderer 渲染器
   - ✅ 组件注册表（registry）

2. **基础组件**（15+ 组件）：
   - ✅ 3D 场景：RotatingEarth, CardStack3D, Scene3D
   - ✅ 图表：SmoothLineChart, BarChart, ComparisonChart, DonutChart
   - ✅ 粒子：Fireflies, ParticleSystem
   - ✅ 文字：CinematicTitle, AnimatedText, TypeWriter, AnimatedCounter
   - ✅ 转场：GlitchEffect, MotionBlur, GradientTransition, MorphTransition
   - ✅ RVE 模板：12 个高质量模板

### ⚠️ 待优化（视觉效果层）

**需要其他 Agent 协助的部分**：

1. **PBR 材质系统**：
   - ❌ 当前使用 MeshBasicMaterial（纯色）
   - ✅ 需要升级为 MeshStandardMaterial（PBR）
   - ✅ 需要添加法线贴图、粗糙度贴图、金属度贴图

2. **复杂光照系统**：
   - ❌ 当前只有 1 环境光 + 1 方向光
   - ✅ 需要多光源 + 阴影系统

3. **后处理管线**：
   - ❌ 当前无后处理
   - ✅ 需要 Bloom、DOF、ToneMapping、SSAO

4. **高质量纹理**：
   - ❌ 当前使用简单颜色
   - ✅ 需要多层程序化纹理（噪声函数、分形）

5. **性能优化**：
   - ❌ 未做性能优化
   - ✅ 需要平衡质量和性能

## 🏗️ 项目架构

```
motion-lab/
├─ package.json                 # 依赖配置
├─ tsconfig.json               # TypeScript 配置
├─ remotion.config.ts          # Remotion 配置
├─ src/
│  ├─ index.ts                 # 入口文件
│  ├─ Root.tsx                 # Remotion Root
│  ├─ VideoRenderer.tsx        # 核心渲染器
│  ├─ schema/
│  │  └─ video-spec.ts         # Zod schema 定义
│  ├─ components/              # 所有组件
│  │  ├─ 3d/                   # 3D 场景
│  │  │  ├─ RotatingEarth.tsx
│  │  │  ├─ CardStack3D.tsx
│  │  │  └─ Scene3D/          # remotion-bits 3D 场景
│  │  ├─ charts/               # 图表
│  │  │  ├─ SmoothLineChart.tsx
│  │  │  ├─ BarChart.tsx
│  │  │  ├─ ComparisonChart.tsx
│  │  │  └─ DonutChart.tsx
│  │  ├─ particles/            # 粒子系统
│  │  │  ├─ Fireflies.tsx
│  │  │  └─ ParticleSystem/   # remotion-bits 粒子系统
│  │  ├─ text/                 # 文字动效
│  │  │  ├─ CinematicTitle.tsx
│  │  │  ├─ AnimatedText.tsx
│  │  │  ├─ TypeWriter.tsx
│  │  │  └─ AnimatedCounter.tsx
│  │  ├─ transitions/          # 转场特效
│  │  │  ├─ GlitchEffect.tsx
│  │  │  ├─ MotionBlur.tsx
│  │  │  └─ GradientTransition.tsx
│  │  ├─ rve/                  # RVE 模板（12 个）
│  │  │  ├─ rotating-carousel.tsx
│  │  │  ├─ particle-explosion.tsx
│  │  │  ├─ morph-transition.tsx
│  │  │  └─ ...（共 12 个）
│  │  ├─ AudioSync.tsx         # 音频同步
│  │  └─ StaggeredMotion.tsx   # 交错动画
│  ├─ utils/
│  │  └─ catmull-rom.ts        # Catmull-Rom 曲线工具
│  └─ data/
│     └─ demo-spec.json        # 演示数据
└─ AGENTS.md                   # 本文档
```

## 🔧 技术栈

```json
{
  "remotion": "4.0.535",
  "@remotion/three": "4.0.535",
  "three": "^0.176.0",
  "remotion-bits": "local",
  "zod": "^3.25.67"
}
```

## 📋 任务分解

### Agent A（架构整合 - Claw 已完成）

✅ 项目架构设计
✅ 基础组件整合
✅ 文档编写
✅ 资源整合

### Agent B（视觉效果优化 - 需要专业 Agent）

**任务**：升级视觉效果到游戏级

**具体要求**：

1. **PBR 材质系统**：
   ```tsx
   // 当前（基础版）
   const material = new THREE.MeshBasicMaterial({ color: 0x4a90e2 });
   
   // 目标（PBR 版）
   const material = new THREE.MeshStandardMaterial({
     map: diffuseMap,
     normalMap: normalMap,
     roughnessMap: roughMap,
     metalnessMap: metalMap,
     roughness: 0.3,
     metalness: 0.1
   });
   ```

2. **复杂光照系统**：
   ```tsx
   // 当前（简单版）
   <ambientLight intensity={0.5} />
   <directionalLight position={[1, 1, 1]} intensity={1} />
   
   // 目标（复杂版）
   <ambientLight intensity={0.3} />
   <directionalLight position={[5, 5, 5]} intensity={1.5} castShadow />
   <pointLight position={[0, 2, 0]} intensity={0.8} color="#ffaa00" />
   ```

3. **后处理管线**：
   ```tsx
   import { EffectComposer, Bloom, DepthOfField, ToneMapping } from '@react-three/postprocessing';
   
   <EffectComposer>
     <DepthOfField focusDistance={0.02} focalLength={0.05} />
     <Bloom luminanceThreshold={0.8} intensity={1.5} />
     <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
   </EffectComposer>
   ```

4. **高质量纹理**：
   - 参考：GitHub 上的高质量 Three.js 地球示例
   - 技术：多层噪声叠加、分形布朗运动、程序化纹理生成

**参考案例**：
- 用户提供的视频：`1_1792113866191_0xea.mp4`、`2_1792113866192_kvaq.mp4`
- GitHub 示例：搜索 "three.js earth pbr"、"three.js postprocessing example"

**验收标准**：
- 达到用户提供的视频效果水平（游戏级画面质感）
- 渲染性能：1080p 视频渲染时间 < 5 分钟
- 无明显 bug 或性能问题

### Agent C（性能优化 - 可选）

**任务**：优化渲染性能

**具体要求**：
- 使用 `useMemo` 缓存计算结果
- 使用 `React.memo` 优化组件重渲染
- 使用 `useCallback` 缓存函数
- 优化 shader 性能
- 平衡质量和性能

## 🎨 组件接口

### VideoSpec（视频规格）

```typescript
interface VideoSpec {
  title: string;
  width: number;      // 默认 1920
  height: number;     // 默认 1080
  fps: number;        // 默认 30
  shots: Shot[];
}

interface Shot {
  duration: number;
  camera?: Camera;
  elements: Element[];
}

interface Element {
  type: string;       // '3d-scene' | 'chart' | 'text' | 'transition'
  component: string;  // 组件名称
  data: any;          // 组件数据
  animation?: Animation;
}
```

### 示例数据

```json
{
  "title": "OPC 政策追踪",
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "shots": [
    {
      "duration": 3,
      "elements": [
        {
          "type": "3d-scene",
          "component": "RotatingEarth",
          "data": {
            "rotationSpeed": 0.002,
            "showAtmosphere": true
          }
        }
      ]
    }
  ]
}
```

## 🚀 本地运行

```bash
# 1. 安装依赖
npm install

# 2. 启动预览
npm run dev

# 3. 浏览器打开 http://localhost:3000
# 选择 DemoVideo 预览

# 4. 渲染视频
npm run render
# 输出到 out/video.mp4
```

## 📦 整合包内容

```
motion-lab-full/
├─ motion-lab/              # MotionLab 源码
├─ rve-templates/           # RVE 模板库（75 个免费模板）
├─ remotion-bits/           # remotion-bits 源码（46 个 bits）
├─ remotion-skills/         # Remotion 官方 skills（12 个）
└─ AGENTS.md                # 本文档
```

## 🤝 协作方式

### 本地化方案

**架构**：
```
本地（你的电脑）          云端（Claw 的云盘）
┌─────────────────┐      ┌─────────────────┐
│ motion-lab/     │ ←→   │ motion-lab/     │
│ ├─ src/         │ 同步  │ ├─ src/         │
│ ├─ components/  │      │ ├─ components/  │
│ └─ ...          │      │ └─ ...          │
└─────────────────┘      └─────────────────┘
     ↑                         ↑
  本地测试                 云端备份
  npm run dev              文件管理
  npm run render           整合包
```

**同步方案**：
- 方案 A：Git 同步（推荐）
- 方案 B：文件同步（定期打包整合包）

### 任务分配

1. **Claw（我）**：
   - ✅ 架构设计
   - ✅ 资源整合
   - ✅ 文档编写
   - ⚠️ 基础代码（已完成）

2. **其他 Agent（Codex/Trae/Kimi 等）**：
   - 视觉效果优化（PBR、光照、后处理）
   - 性能优化
   - 测试和调试

3. **用户**：
   - 本地测试
   - 效果验收
   - 反馈调整

## 📞 联系方式

如有问题，请联系用户（晚风徐徐）。

---

**文档版本**：v1.0  
**最后更新**：2026-10-16  
**维护者**：Claw
