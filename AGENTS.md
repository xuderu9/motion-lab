# MotionLab — 面向 AI Agent 的工作说明

> **两个必读入口（任何会话开始先看这两份）：**
> - **[HANDOFF.md](./HANDOFF.md)** — 项目目标、人类已确认的决策、参考片量化基准、关键常量、一周计划。
>   上下文被压缩后或换新会话，读这一份就能冷启动。
> - **[COLLAB.md](./COLLAB.md)** — 多 Agent 协作的「当前锁」。不在锁里就只能读不能写；
>   收工前更新它并 commit，消息前缀 `[codex]` / `[dsh]`。
>
> 另一份值得读的：[studio/PLAYBOOK.md](./studio/PLAYBOOK.md) — 交付流程规则与踩坑记录。

> 本文档描述的是**代码里真实存在的东西**。
> 上一版 AGENTS.md 写错的目录结构和"已完成"清单，是后续多个 AI 反复踩坑的根源
> （比如它说 3D 场景在 `src/components/3d/Scene3D/`，实际在 `src/components/Scene3D/`），
> 所以本文档的原则是：**只写能跑出来的事实，并附验证命令**。

---

## 0. 30 秒上手

```powershell
cd D:\codex2\REMOTIONAI2\motion-lab
npm install
npm run typecheck     # TypeScript 必须 0 报错
npm run dev           # 打开 http://localhost:3000 在 Studio 里预览
npm run render        # 输出 out/demo.mp4
```

视频内容由 `src/data/demo-spec.json` 描述，改 JSON 就能改片子，不用碰组件。

---

## 1. 技术栈与版本（已锁定，改之前先想清楚）

| 依赖 | 版本 | 说明 |
|------|------|------|
| remotion / @remotion/* | 4.0.535 | 全部必须同版本 |
| react | 18.3.1 | **不要升到 19**，R3F v8 与 @react-three/postprocessing v2 只支持 18 |
| @react-three/fiber | 8.18.0 | |
| @react-three/drei | 9.122.0 | |
| @react-three/postprocessing | 2.19.1 | **v3 需要 React 19，不能升** |
| three | 0.182.0 | 必须全仓库只有一个实例，否则报 "Multiple instances of Three.js" |
| zod | 4.5.4 | Remotion 4.0.535 要求 zod 4；zod 3 会触发版本告警 |
| remotion-bits | 0.2.1 | 组件是从它 `src/` 复制出来改的，见第 4 节 |

几个**别踩的坑**（都是实测踩过的）：

- **zod 4 的 `.default()` 语义变了**：它要求传入「输出类型」。想给"输入"默认值要用
  `.prefault()`。见 `src/schema/video-spec.ts` 里 `camera: CameraSchema.prefault({})`。
- **Remotion 的 `<Composition schema={...}>`**：`defaultProps` 与 `component` 的 props
  必须是 schema 的**输入类型**（`z.input`），不是 `z.infer`。见第 3 节。
- props 类型**必须用 `type` 不能用 `interface`**：Remotion 会把 props 约束到
  `Record<string, unknown>`，而 TS 只给 type alias 隐式索引签名。
- **渲染后端必须走硬件**，见第 5 节，否则慢 10 倍。

---

## 2. 真实目录结构

```
motion-lab/
├─ src/
│  ├─ index.ts                  # registerRoot 入口
│  ├─ Root.tsx                  # 注册 <Composition>（DemoVideo）
│  ├─ VideoRenderer.tsx         # 按 spec 的 shots/elements 渲染；组件分发表（switch）
│  ├─ schema/video-spec.ts      # Zod schema：VideoSpec / Shot / Element / Camera ...
│  ├─ data/demo-spec.json       # 唯一的示例数据（OPC 政策追踪）
│  ├─ components/
│  │  ├─ 3d/
│  │  │  ├─ RotatingEarth.tsx   # 对外组件（转调 earth/EarthScene）
│  │  │  ├─ CardStack3D.tsx
│  │  │  └─ earth/              # ← 3D 地球的真实实现
│  │  │     ├─ EarthScene.tsx       # 场景总装：地表/云层/大气/灯光/星空
│  │  │     ├─ proceduralEarth.ts   # 程序化 PBR 贴图生成（确定性噪声）
│  │  │     ├─ Starfield.tsx        # 确定性星空（不用 drei 的 Stars，见第 6 节）
│  │  │     ├─ CameraRig.tsx        # 把 spec 里的 camera.motion 真正实现成镜头运动
│  │  │     └─ PostFX.tsx           # Bloom / Vignette / 可选景深
│  │  ├─ 3d/CardStack3D.tsx
│  │  ├─ charts/                # SmoothLineChart / BarChart / ComparisonChart / DonutChart
│  │  ├─ text/CinematicTitle.tsx
│  │  ├─ particles/Fireflies.tsx
│  │  ├─ transitions/           # GlitchEffect / MotionBlur / GradientTransition
│  │  ├─ rve/                   # 12 个 RVE 风格模板（animated-text、matrix-rain 等）
│  │  ├─ AnimatedText.tsx AnimatedCounter.tsx StaggeredMotion.tsx TypeWriter.tsx
│  │  ├─ ParticleSystem/        # 粒子系统（来自 remotion-bits）
│  │  └─ Scene3D/               # 3D 步骤/相机/元素（来自 remotion-bits）
│  ├─ utils/                    # ← 曾被整个漏掉，见第 4 节
│  │  ├─ index.ts motion/ particles/ interpolate.ts interpolate3d.ts
│  │  ├─ transform3d.ts geometry.ts color.ts gradient.ts random.ts StepContext.ts
│  │  └─ catmull-rom.ts         # 本项目自己的：折线图平滑用
│  └─ hooks/                    # useViewportRect（来自 remotion-bits）
├─ remotion.config.ts           # ★ 渲染后端等关键配置，见第 5 节
├─ .gitignore / .gitattributes  # 见 LOCAL-GIT-GUIDE.md
├─ AGENTS.md / README.md / LOCAL-GIT-GUIDE.md
└─ TASK-*.md                    # 早期的任务书（部分已完成/已失效，见文末）
```

**没有** registry / matcher / core 这些层——组件分派就是 `VideoRenderer.tsx` 里
一个 `switch (component)`。想加新组件：写组件 → 在 schema 的 `type` 里选一个已有分类
→ 在 `switch` 里加一个 `case`。

---

## 3. Remotion 的 props / schema 约定（改 Root.tsx 前必读）

Remotion 把 `schema` 用来描述**组件 props 本身**，而且 `defaultProps` 要求的是
schema 的**输入类型**。所以：

```tsx
// VideoRenderer 的 props 就直接是「视频规格」，不要再包一层 { spec }
type VideoRendererProps = VideoSpecInput;                  // z.input<typeof VideoSpecSchema>
const spec = VideoSpecSchema.parse(rawSpec);               // 组件内部补齐 .default()

<Composition
  component={VideoRenderer}
  schema={VideoSpecSchema}          // 这样 Studio 里可以逐字段编辑
  defaultProps={demoSpec}
/>
```

**不要**写 `defaultProps={{ spec }}` + `schema={z.object({spec: ...})}` 那种包一层
的写法：`PropsIfHasProps` 会要求 defaultProps 同时满足裸 schema 的输入形状，直接编译失败。

---

## 4. `src/components/` 里那批"外来"组件

`Scene3D/`、`ParticleSystem/`、`AnimatedText.tsx`、`AnimatedCounter.tsx`、
`StaggeredMotion.tsx`、`TypeWriter.tsx`、`GradientTransition.tsx`
是从 `node_modules/remotion-bits/src/` **逐字节复制**出来的（方便本地改）。

⚠️ 当初复制时**漏掉了它们依赖的整棵 `src/utils/**` 和 `src/hooks/**`**，
导致 9 个模块找不到、整个项目编译不过。现已补回。

**如果你要重新从 remotion-bits 复制组件，记得连 `utils/` 一起复制**：

```powershell
Copy-Item -Recurse node_modules\remotion-bits\src\utils\*  src\utils\
Copy-Item -Recurse node_modules\remotion-bits\src\hooks\*  src\hooks\
```

另外 `remotion-bits` 的 `dist/` 类型定义比它自己的 `src/` 旧（上游的版本偏差），
所以本地组件**必须 import 本地的 `../utils/motion`**，不要从 `remotion-bits` 包导入类型。

---

## 5. ★ 渲染性能：必须开硬件后端

Remotion 默认的 Chromium 后端在 Windows 上会退化成 **SwiftShader（纯 CPU 软件光栅化）**。
3D + Bloom 属于填充率密集型，软渲下会慢得离谱：

| 后端 | 60 帧 1080p | 900 帧 1080p（30s） |
|------|------------|--------------------|
| 默认（SwiftShader） | 109.0s | 418.6s |
| `angle`（D3D11 硬件） | 10.5s | **~29s** |

已在 `remotion.config.ts` 里固定：

```ts
Config.setChromiumOpenGlRenderer("angle");
```

换到没有独显/驱动异常的环境报错时，改成 `swangle` 或临时覆盖：

```powershell
npx remotion render --gl=swangle
```

---

## 6. 确定性：视频渲染的硬性要求

Remotion 会**并发开多个浏览器 Tab 分帧渲染**。任何一帧的像素如果依赖
`Math.random()`、`Date.now()` 或 `useFrame` 的 delta 累加，就会：

- 同一条视频里画面跳变（重影/闪烁）
- 重渲同一帧得到不同结果，无法排查问题

**规则**：

1. 所有动画由 `useCurrentFrame()` 推导，**禁止累加**。
   → `EarthScene` 里是 `rotation.y = frame * rotationSpeed`，不是 `+=`。
2. 所有随机数用固定种子的 `mulberry32`。
   → `proceduralEarth.ts`、`Starfield.tsx` 都是。
3. **不要用 drei 的 `<Stars>`**：它内部用 `Math.random()` 生成恒星位置，
   且把时间写在 `useFrame` 里累加 → 星空会跳。用 `earth/Starfield.tsx`。

验证确定性（同一帧渲两次，比对哈希）：

```powershell
npx remotion still DemoVideo out/a.png --frame=60
npx remotion still DemoVideo out/b.png --frame=60
(Get-FileHash out/a.png).Hash -eq (Get-FileHash out/b.png).Hash   # 期望 True
```

> 注意：软件后端与硬件后端之间像素会有极小差异（光栅化精度不同），这是正常的；
> 同一后端内可复现。

---

## 7. 3D 地球有哪些可调参数

都在 `element.data` 里（见 `demo-spec.json` 的 `RotatingEarth` 元素）：

| 参数 | 默认 | 说明 |
|------|------|------|
| `rotationSpeed` | 0.002 | 每帧自转弧度 |
| `axialTilt` | 23.44 | 地轴倾角（度） |
| `sunDirection` | `[1, 0.28, 0.45]` | 太阳方向；偏侧向才有明显明暗交界线 |
| `sunIntensity` | 2.6 | 太阳主光强度 |
| `quality` | `"high"` | `low/medium/high` → 贴图 512/1024/2048 宽 |
| `showAtmosphere` / `showClouds` / `showNightLights` / `showStars` / `showBackground` | true | 分层开关，排查问题时可逐个关掉 |
| `enablePostFx` | true | Bloom + Vignette |
| `bloomIntensity` / `bloomThreshold` | 0.85 / 0.62 | 阈值越高越只让高光发光（不易过曝） |
| `enableDof` | false | 景深，会明显增加渲染时间 |
| `cameraZ` / `fov` | 4.6 / 40 | 机位距离与视场角（决定地球占画面多大） |

镜头运动来自 **shot 层**的 `camera.motion`（`push-in` / `pull-out` / `pan-left` /
`pan-right` / `orbit` / `static`），由 `earth/CameraRig.tsx` 实现。

### 曝光自查（改完灯光一定要量一下）

用固定阈值判断有没有过曝（`>=250` 占比超过 ~6% 就偏亮了）：

```powershell
Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Bitmap]::FromFile((Resolve-Path out\a.png)); $n=0;$c=0
for($y=0;$y -lt $img.Height;$y+=4){for($x=0;$x -lt $img.Width;$x+=4){
  $p=$img.GetPixel($x,$y);$n++
  if((0.2126*$p.R+0.7152*$p.G+0.0722*$p.B) -ge 250){$c++}}}
"clipped: {0:P2}" -f ($c/$n)
```

参考基线（frame 60，1920×1080）：**地球圆盘内 meanLuma ≈ 87**、
**圆盘内 ≥250 过曝占比 ≈ 4.3%**、**圆盘内 <25 的近黑占比 ≈ 2%**、
全画面 meanLuma ≈ 32。数值明显偏离就说明曝光或大气强度被改坏了。

### 大气晕是不是"硬边圆环"也能量出来

沿画面中心向外按半径分桶，取每桶的平均亮度。健康的大气是**一个宽而平缓的鼓包**，
峰值大约只比球体内部亮 20~25%，然后一路单调衰减到太空；
如果是硬边圆环，曲线会在某个半径上突然出现一个尖峰、紧接着陡降。

实测（frame 60，球体轮廓约 r≈330px）：r=0→160px 稳定在 79~84，
r=180→220px 升到 94~99（大气边缘光），之后 240→280 降到 91→78，
300→340 平滑落到 72→61。

---

## 8. 提交前自检

```powershell
npm run typecheck    # tsc --noEmit 必须通过
npm run still        # 能渲出一帧
npm run render       # 能出完整视频（应约 30 秒，明显更慢请检查渲染后端）
```

Git 相关见 `LOCAL-GIT-GUIDE.md`。

---

## 9. 任务书状态

| 文件 | 状态 |
|------|------|
| `TASK-CODEX-3D.md` | ✅ 已完成（PBR / 光照 / 大气 / 云层 / 夜景灯光 / 后处理 / 镜头运动） |
| `TASK-KIMI-PERFORMANCE.md` | ✅ 已完成（真正的瓶颈是渲染后端，不是 useMemo；结论已写回该文档） |
| `TASK-TRAE-EFFECTS.md` | ⏳ 待做（转场/特效层） |

---

**文档版本**：v2.0
**最后更新**：2026-10-16
