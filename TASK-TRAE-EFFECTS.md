# 任务：视觉效果优化（Trae）

## 🎯 任务目标

添加后处理效果和特效，提升视觉质量到游戏级画面质感

## 📋 具体工作

### 1. 后处理管线

**安装依赖**：
```bash
npm install @react-three/postprocessing
```

**添加后处理效果**：
```tsx
import { EffectComposer, Bloom, DepthOfField, ToneMapping } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';

<Canvas>
  <Scene />
  <EffectComposer>
    {/* 光晕效果 */}
    <Bloom 
      intensity={1.5}
      luminanceThreshold={0.8}
      luminanceSmoothing={0.025}
    />
    
    {/* 景深效果 */}
    <DepthOfField 
      focusDistance={0.02}
      focalLength={0.05}
      bokehScale={2}
    />
    
    {/* 色调映射（电影感） */}
    <ToneMapping 
      mode={ToneMappingMode.ACES_FILMIC}
    />
  </EffectComposer>
</Canvas>
```

**参考案例**：
- GitHub 搜索：`react-three-postprocessing examples`
- 官方文档：https://github.com/pmndrs/react-three-postprocessing

### 2. 特效组件

**粒子爆炸效果**：
```tsx
// 参考 RVE 模板：particle-explosion.tsx
// 已经有源码，可以优化和整合
```

**渐变转场效果**：
```tsx
// 参考 RVE 模板：gradient-shift.tsx
// 已经有源码，可以优化和整合
```

**变形转场效果**：
```tsx
// 参考 RVE 模板：morph-transition.tsx
// 已经有源码，可以优化和整合
```

### 3. 视觉效果增强

**环境光遮蔽（SSAO）**：
```tsx
import { SSAO } from '@react-three/postprocessing';

<EffectComposer>
  <SSAO 
    intensity={30}
    radius={0.1}
    luminanceInfluence={0.5}
  />
</EffectComposer>
```

**色差效果**：
```tsx
import { ChromaticAberration } from '@react-three/postprocessing';

<EffectComposer>
  <ChromaticAberration 
    offset={[0.002, 0.002]}
    radialModulation={false}
    modulationOffset={0.0}
  />
</EffectComposer>
```

**晕影效果**：
```tsx
import { Vignette } from '@react-three/postprocessing';

<EffectComposer>
  <Vignette 
    offset={0.5}
    darkness={0.5}
  />
</EffectComposer>
```

## 📁 工作范围

**可以修改以下文件**：
- `src/components/effects/`（新建目录）
- `src/components/transitions/`（转场特效）
- `src/components/particles/`（粒子系统）
- `src/components/3d/`（3D 场景的后处理）

**不要修改**：
- ❌ `core/` 目录
- ❌ `utils/` 目录
- ❌ 其他 agent 正在修改的文件（3D 场景的 PBR 材质）

## 🎨 参考效果

用户提供的视频（游戏级画面质感）：
- 光晕效果（Bloom）
- 景深虚化（Depth of Field）
- 电影级色调（Tone Mapping）
- 环境光遮蔽（SSAO）

## 📝 交付物

1. 新增的特效组件
2. 后处理管线的集成代码
3. 简短说明（改了什么、为什么这么改）
4. 效果截图或渲染视频（如果可能）

## 🔧 技术栈

```json
{
  "@react-three/postprocessing": "^3.0.0",
  "postprocessing": "^6.35.0"
}
```

## ⚠️ 注意事项

1. **性能考虑**：后处理会影响性能，需要平衡质量和性能
2. **Remotion 兼容**：确保在 Remotion 渲染时正常工作
3. **减少 AI 幻觉**：参考实际的案例，不要凭空想象
4. **小步迭代**：每次加 1-2 个效果，测试后再继续
5. **不要和 Codex 冲突**：Codex 在做 PBR 材质，你专注于后处理和特效

## 📞 联系方式

完成后，把代码发给用户（晚风徐徐）。

---

**文档版本**：v1.0  
**最后更新**：2026-10-16
