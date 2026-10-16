# 任务：3D 场景优化（Codex）

## 🎯 任务目标

升级 MotionLab 的 3D 场景到**游戏级画面质感**

## 📋 具体工作

### 1. PBR 材质系统

**当前状态**：
```tsx
// 使用 MeshBasicMaterial（简单颜色）
const material = new THREE.MeshBasicMaterial({ color: 0x4a90e2 });
```

**目标状态**：
```tsx
// 使用 MeshStandardMaterial（PBR）
const material = new THREE.MeshStandardMaterial({
  map: diffuseMap,           // 基础色贴图
  normalMap: normalMap,      // 法线贴图（凹凸细节）
  roughnessMap: roughMap,    // 粗糙度贴图
  metalnessMap: metalMap,    // 金属度贴图
  roughness: 0.3,
  metalness: 0.1
});
```

**参考案例**：
- GitHub 搜索：`three.js earth pbr`
- 关键词：`MeshStandardMaterial`, `PBR`, `physically based rendering`

### 2. 复杂光照系统

**当前状态**：
```tsx
// 简单光照
<ambientLight intensity={0.5} />
<directionalLight position={[1, 1, 1]} intensity={1} />
```

**目标状态**：
```tsx
// 复杂光照
<ambientLight intensity={0.3} />
<directionalLight 
  position={[5, 5, 5]} 
  intensity={1.5}
  castShadow  // 投射阴影
  shadow-mapSize={[2048, 2048]}
/>
<pointLight position={[0, 2, 0]} intensity={0.8} color="#ffaa00" />
<spotLight position={[-3, 3, 0]} angle={0.3} penumbra={0.5} />
```

### 3. 高质量纹理

**当前状态**：简单颜色

**目标状态**：多层程序化纹理
- 海洋深度变化
- 大陆形状
- 山脉
- 云层
- 夜晚灯光

**参考案例**：
- GitHub 搜索：`three.js procedural texture`, `three.js noise`
- 技术：Perlin Noise, Fractal Brownian Motion

## 📁 工作范围

**只修改以下文件**：
- `src/components/3d/RotatingEarth.tsx`
- `src/components/3d/CardStack3D.tsx`
- `src/components/3d/Scene3D/`

**不要修改**：
- ❌ `core/` 目录
- ❌ `utils/` 目录
- ❌ 其他 agent 的组件

## 🎨 参考效果

用户提供的视频（游戏级画面质感）：
- 视频中的 3D 场景效果
- 超现实风格
- 电影级光照
- 细腻的材质

## 📝 交付物

1. 修改后的代码文件
2. 简短说明（改了什么、为什么这么改）
3. 效果截图或渲染视频（如果可能）

## 🔧 技术栈

```json
{
  "three": "^0.176.0",
  "@remotion/three": "4.0.535",
  "@react-three/fiber": "^9.0.0",
  "@react-three/drei": "^10.0.0"
}
```

## ⚠️ 注意事项

1. **减少 AI 幻觉**：参考实际的 GitHub 案例，不要凭空想象
2. **小步迭代**：每次改 100-200 行，测试效果后再继续
3. **性能考虑**：PBR 和后处理会影响性能，需要平衡
4. **Remotion 兼容**：确保在 Remotion 渲染时正常工作

## 📞 联系方式

完成后，把代码发给用户（晚风徐徐）。

---

**文档版本**：v1.0  
**最后更新**：2026-10-16
