# 任务：性能优化（Kimi）

## 🎯 任务目标

优化 MotionLab 的渲染性能，确保 1080p 视频渲染时间 < 5 分钟

## 📋 具体工作

### 1. React 性能优化

**使用 `useMemo` 缓存计算结果**：
```tsx
// ❌ 错误：每次都重新计算
const data = computeExpensiveData(props);

// ✅ 正确：只在依赖变化时重新计算
const data = useMemo(() => computeExpensiveData(props), [props]);
```

**使用 `React.memo` 优化组件重渲染**：
```tsx
// ❌ 错误：每次父组件渲染都重新渲染
function MyComponent({ data }) {
  return <div>{data}</div>;
}

// ✅ 正确：只在 props 变化时重新渲染
const MyComponent = React.memo(function MyComponent({ data }) {
  return <div>{data}</div>;
});
```

**使用 `useCallback` 缓存函数**：
```tsx
// ❌ 错误：每次渲染都创建新函数
const handleClick = () => { ... };

// ✅ 正确：只在依赖变化时创建新函数
const handleClick = useCallback(() => { ... }, [deps]);
```

### 2. Three.js 性能优化

**优化几何体和材质**：
```tsx
// ❌ 错误：每次都创建新几何体
<mesh geometry={new THREE.BoxGeometry(1, 1, 1)} />

// ✅ 正确：复用几何体
const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
<mesh geometry={geometry} />
```

**使用实例化渲染**：
```tsx
// 如果有大量相同的物体，使用 InstancedMesh
const instances = useMemo(() => {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  // 设置实例矩阵
  return mesh;
}, []);
```

### 3. Shader 优化

**优化 shader 代码**：
- 减少纹理采样次数
- 使用低精度浮点数（`mediump` 或 `lowp`）
- 避免复杂的循环和分支

### 4. 渲染优化

**使用 `frameloop="demand"`**：
```tsx
// 只在需要时渲染，而不是每帧都渲染
<Canvas frameloop="demand">
  <Scene />
</Canvas>
```

**使用 `dpr` 控制像素比**：
```tsx
// 降低像素比，提高性能
<Canvas dpr={[1, 1.5]}>
  <Scene />
</Canvas>
```

## 📁 工作范围

**可以修改所有组件**，但要注意：
- ✅ 优化性能，不改变功能
- ✅ 不改变视觉效果
- ✅ 确保向后兼容

**重点关注**：
- `src/components/3d/`（3D 场景）
- `src/components/charts/`（图表）
- `src/components/particles/`（粒子系统）
- `src/VideoRenderer.tsx`（核心渲染器）

## 📊 性能指标

**目标**：
- 1080p 视频渲染时间 < 5 分钟
- 内存占用 < 2GB
- 无明显卡顿或掉帧

**测试方法**：
```bash
npm run render
# 查看渲染时间和内存占用
```

## 📝 交付物

1. 优化后的代码文件
2. 性能测试报告（渲染时间、内存占用）
3. 简短说明（改了什么、性能提升了多少）

## ⚠️ 注意事项

1. **不要改变视觉效果**：只优化性能，不改变画面
2. **测试所有组件**：确保没有引入 bug
3. **向后兼容**：确保现有的 spec 数据仍然可用
4. **文档说明**：说明性能优化的方法和效果

## 📞 联系方式

完成后，把代码发给用户（晚风徐徐）。

---

**文档版本**：v1.0  
**最后更新**：2026-10-16
