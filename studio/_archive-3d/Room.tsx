// 夜景桌面「虚拟摄影棚」
//
// 设计依据（来自 cankaoshipin 母带实测）：
//   1. 相机锁死 —— 355/360 帧位移为 0。所以这里不写任何运镜。
//   2. 环境是静态的 —— 只有屏幕内容在动。
//   3. 出「游戏级」的四个开关：HDRI 环境光 / PBR 材质 / 景深 / 冷暖分离。

import React, { useMemo } from "react";
import * as THREE from "three";
import { Environment } from "@react-three/drei";

/** 确定性伪随机（渲染必须可复现，绝不能用 Math.random） */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 窗外城市夜景 —— 程序化生成，不需要任何素材。
 * 参考片里那片城市散景就是这个东西：暗蓝底 + 暖/冷光点 + 楼体剪影。
 */
export function useCityBokeh(): THREE.CanvasTexture {
  return useMemo(() => {
    const W = 1024;
    const H = 640;
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const g = cv.getContext("2d")!;
    const rnd = mulberry32(20261016);

    // 夜空渐变：上冷下沉，底部带一点城市辉光
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#050a16");
    sky.addColorStop(0.55, "#0a1526");
    sky.addColorStop(1, "#132033");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // 楼体剪影（越远越淡）
    for (let layer = 0; layer < 3; layer++) {
      const alpha = 0.35 + layer * 0.22;
      const baseY = H * (0.62 + layer * 0.1);
      g.fillStyle = `rgba(4,8,16,${alpha})`;
      let x = -40;
      while (x < W + 40) {
        const w = 40 + rnd() * 90;
        const h = 60 + rnd() * (150 + layer * 90);
        g.fillRect(x, baseY - h, w, H - (baseY - h));
        x += w + 6 + rnd() * 18;
      }
    }

    // 窗户灯点
    for (let i = 0; i < 900; i++) {
      const x = rnd() * W;
      const y = H * 0.55 + rnd() * H * 0.45;
      const warm = rnd() > 0.35;
      const r = 0.7 + rnd() * 1.6;
      g.fillStyle = warm
        ? `rgba(255,${190 + rnd() * 40 | 0},${120 + rnd() * 60 | 0},${0.5 + rnd() * 0.5})`
        : `rgba(${170 + rnd() * 50 | 0},${215 + rnd() * 40 | 0},255,${0.45 + rnd() * 0.5})`;
      g.fillRect(x, y, r, r);
    }

    // 散景光斑：大而柔，是「夜景高级感」的主要来源
    for (let i = 0; i < 70; i++) {
      const x = rnd() * W;
      const y = H * 0.6 + rnd() * H * 0.4;
      const r = 8 + rnd() * 34;
      const warm = rnd() > 0.4;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const c = warm
        ? `rgba(255,196,132,`
        : `rgba(150,205,255,`;
      grad.addColorStop(0, c + (0.5 + rnd() * 0.4) + ")");
      grad.addColorStop(0.45, c + "0.16)");
      grad.addColorStop(1, c + "0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

/** 平板屏幕上的 UI —— 每帧重绘到 canvas，再作为自发光贴图贴到面板上 */
export function drawScreenUI(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  p: { t: number; count: number; ring: number; bars: number[]; reveal: number },
) {
  const S = W / 1024; // 以 1024 宽为设计基准
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0b141f");
  bg.addColorStop(1, "#070d16");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.scale(S, S);
  const w = W / S;
  const h = H / S;

  // 顶栏
  ctx.fillStyle = "rgba(255,255,255,0.055)";
  ctx.fillRect(0, 0, w, 76);
  ctx.fillStyle = "#e8eef6";
  ctx.font = "600 30px Inter, 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("Workspace", 36, 50);
  ctx.fillStyle = "rgba(180,200,220,0.45)";
  ctx.font = "400 17px Inter, 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("Prompts · Skills · Docs", 36, 100);

  // 右侧蓝色药丸
  ctx.fillStyle = "#2d6cf6";
  const pillW = 118;
  const pillH = 34;
  const pillX = w - pillW - 34;
  ctx.beginPath();
  ctx.roundRect(pillX, 21, pillW, pillH, 17);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "500 16px Inter, sans-serif";
  ctx.fillText("Expand", pillX + 30, 44);

  // 左栏：Prompts 列表（逐行浮现）
  const rows = [
    "Summarize this meeting",
    "Draft a follow-up email",
    "Refactor to TypeScript",
    "Explain like I'm five",
  ];
  rows.forEach((text, i) => {
    const a = Math.max(0, Math.min(1, p.reveal * 4 - i));
    if (a <= 0) return;
    ctx.globalAlpha = a;
    const y = 150 + i * 52;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.beginPath();
    ctx.roundRect(34, y - 26, w * 0.42, 40, 10);
    ctx.fill();
    ctx.fillStyle = "rgba(226,236,248,0.9)";
    ctx.font = "400 18px Inter, sans-serif";
    ctx.fillText(text, 50, y);
    ctx.globalAlpha = 1;
  });

  // 右栏：Skills 芯片
  const chips = ["Research", "Coding", "Writing", "Design", "Data", "Video", "Agents"];
  ctx.fillStyle = "rgba(170,195,220,0.5)";
  ctx.font = "500 15px Inter, sans-serif";
  ctx.fillText("Skills", w * 0.52, 152);
  chips.forEach((c, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = w * 0.52 + col * 96;
    const y = 172 + row * 44;
    ctx.fillStyle = "rgba(45,108,246,0.22)";
    ctx.beginPath();
    ctx.roundRect(x, y, 86, 30, 15);
    ctx.fill();
    ctx.fillStyle = "rgba(200,220,245,0.9)";
    ctx.font = "400 14px Inter, sans-serif";
    ctx.fillText(c, x + 14, y + 20);
  });

  // 大数字（计数增长）
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 54px Inter, sans-serif";
  ctx.fillText(p.count.toLocaleString("en-US"), w * 0.52, 296);
  ctx.fillStyle = "rgba(170,195,220,0.5)";
  ctx.font = "400 15px Inter, sans-serif";
  ctx.fillText("skills · agents · docs", w * 0.52, 322);

  // 柱状图（生长）
  const bx = w * 0.52;
  const by = 470;
  const bw = 26;
  p.bars.forEach((v, i) => {
    const hgt = 8 + v * 96;
    const g2 = ctx.createLinearGradient(0, by - hgt, 0, by);
    g2.addColorStop(0, "#3f8bff");
    g2.addColorStop(1, "rgba(63,139,255,0.25)");
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.roundRect(bx + i * (bw + 12), by - hgt, bw, hgt, 5);
    ctx.fill();
  });

  // 进度环 + 计时器
  const cx = w * 0.30;
  const cy = 420;
  const R = 52;
  ctx.lineWidth = 9;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#37d6a8";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.ring);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 26px Inter, sans-serif";
  const secs = Math.floor(p.t);
  ctx.fillText(
    `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`,
    cx - 30,
    cy + 9,
  );
  ctx.fillStyle = "rgba(170,195,220,0.5)";
  ctx.font = "400 15px Inter, sans-serif";
  ctx.fillText("Run", cx - 14, cy + 82);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** 柔和的椭圆接触阴影贴图（黑→透明），让物体「落」在桌面上 */
export function useSoftShadow(): THREE.CanvasTexture {
  return useMemo(() => {
    const S = 256;
    const cv = document.createElement("canvas");
    cv.width = S;
    cv.height = S;
    const g = cv.getContext("2d")!;
    g.clearRect(0, 0, S, S);
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, "rgba(0,0,0,0.9)");
    grad.addColorStop(0.45, "rgba(0,0,0,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

/** 场景：一张夜景桌面。相机锁死，环境静态，只有屏幕在动。 */
export const Room: React.FC<{
  envMap: THREE.Texture | null;
  screenTex: THREE.CanvasTexture | null;
  showEnvBackground?: boolean;
  clay?: boolean;
}> = ({ envMap, screenTex, showEnvBackground = false, clay = false }) => {
  const city = useCityBokeh();
  const shadowTex = useSoftShadow();

  if (clay) {
    // 黏土渲染：均匀打亮 + 每个物体一个独特颜色，只为看清几何布局
    const C = {
      desk: "#ff5555",
      wall: "#5555ff",
      window: "#ffff55",
      strip: "#ff55ff",
      tablet: "#55ffff",
      screen: "#ffffff",
      book: "#ff8800",
      cup: "#00ff88",
      plant: "#00ff00",
      lampPole: "#8888ff",
      lampCone: "#ffffff",
    };
    return (
      <>
        <ambientLight intensity={2.6} />
        <mesh position={[0, 0.75, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[4.2, 3.0]} />
          <meshBasicMaterial color={C.desk} />
        </mesh>
        <mesh position={[0, 1.9, -1.5]}>
          <planeGeometry args={[5.0, 3.6]} />
          <meshBasicMaterial color={C.wall} />
        </mesh>
        <mesh position={[-1.32, 1.62, -1.46]}>
          <planeGeometry args={[2.05, 1.42]} />
          <meshBasicMaterial color={C.window} />
        </mesh>
        <mesh position={[-0.2, 1.5, -1.44]}>
          <planeGeometry args={[0.035, 2.1]} />
          <meshBasicMaterial color={C.strip} />
        </mesh>
        <group position={[0, 0.99, 0.02]} rotation={[-0.24, 0.05, 0]}>
          <mesh>
            <boxGeometry args={[1.18, 0.74, 0.022]} />
            <meshBasicMaterial color={C.tablet} />
          </mesh>
        </group>
        <mesh position={[1.02, 0.79, 0.42]} rotation={[0, -0.4, 0]}>
          <boxGeometry args={[0.44, 0.062, 0.31]} />
          <meshBasicMaterial color={C.book} />
        </mesh>
        <mesh position={[-0.86, 0.87, 0.62]}>
          <cylinderGeometry args={[0.072, 0.06, 0.155, 32]} />
          <meshBasicMaterial color={C.cup} />
        </mesh>
        <mesh position={[1.42, 1.02, -0.32]}>
          <sphereGeometry args={[0.19, 24, 18]} />
          <meshBasicMaterial color={C.plant} />
        </mesh>
      </>
    );
  }

  return (
    <>
      {/* HDRI 环境光 —— 「照片感 vs 塑料感」的分水岭 */}
      {envMap ? (
        <Environment map={envMap} background={showEnvBackground} environmentIntensity={1.0} />
      ) : null}
      <ambientLight intensity={0.3} color="#8fb6d8" />

      {/* 暖色 practical light：台灯（three 0.18x 为物理单位，强度要按 candela 给） */}
      <pointLight position={[1.05, 1.42, 0.45]} intensity={2.2} color="#ffb469" distance={5} decay={2} />
      {/* 冷色补光：模拟窗外夜空漫射 */}
      <pointLight position={[-1.2, 1.3, 1.0]} intensity={1.5} color="#7fb0ff" distance={5} decay={2} />

      {/* 桌子 */}
      <mesh position={[0, 0.75, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.2, 3.0]} />
        <meshStandardMaterial color="#4a3122" roughness={0.34} metalness={0.06} envMapIntensity={0.9} />
      </mesh>

      {/* 背墙 */}
      <mesh position={[0, 1.9, -1.5]}>
        <planeGeometry args={[5.0, 3.6]} />
        <meshStandardMaterial color="#141b24" roughness={0.9} metalness={0} envMapIntensity={0.35} />
      </mesh>

      {/* 窗：一块自发光的城市夜景，靠景深虚化成散景 */}
      <mesh position={[-1.32, 1.62, -1.46]}>
        <planeGeometry args={[2.05, 1.42]} />
        <meshBasicMaterial map={city} toneMapped={false} />
      </mesh>
      {/* 窗框 */}
      <mesh position={[-1.32, 1.62, -1.44]}>
        <ringGeometry args={[1.02, 1.16, 4, 1, Math.PI / 4]} />
        <meshStandardMaterial color="#0c1118" roughness={0.6} metalness={0.4} />
      </mesh>

      {/* 竖向灯带（现代感来源之一）—— 压低亮度，别抢主体 */}
      <mesh position={[-0.2, 1.5, -1.44]}>
        <planeGeometry args={[0.022, 2.1]} />
        <meshBasicMaterial color="#4a4038" toneMapped={false} />
      </mesh>

      {/* 接触阴影：桌面上的柔和暗斑，让平板「落」在桌面上而不是浮着 */}
      <mesh position={[0, 0.754, 0.06]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.85, 0.92]} />
        <meshBasicMaterial map={shadowTex} transparent opacity={0.75} depthWrite={false} />
      </mesh>

      {/* 平板：微微后仰，屏幕上贴 UI 自发光贴图 */}
      <group position={[0, 0.99, 0.02]} rotation={[-0.24, 0.05, 0]}>
        <mesh>
          <boxGeometry args={[1.18, 0.74, 0.022]} />
          <meshStandardMaterial color="#0a0e14" roughness={0.28} metalness={0.72} envMapIntensity={1.1} />
        </mesh>
        <mesh position={[0, 0, 0.013]}>
          <planeGeometry args={[1.1, 0.66]} />
          <meshStandardMaterial
            map={screenTex ?? undefined}
            emissiveMap={screenTex ?? undefined}
            emissive="#ffffff"
            emissiveIntensity={1.15}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* 道具：书 */}
      <mesh position={[1.02, 0.79, 0.42]} rotation={[0, -0.4, 0]}>
        <boxGeometry args={[0.44, 0.062, 0.31]} />
        <meshStandardMaterial color="#16202c" roughness={0.55} metalness={0.05} />
      </mesh>
      {/* 道具：杯子 */}
      <mesh position={[-0.86, 0.87, 0.62]}>
        <cylinderGeometry args={[0.072, 0.06, 0.155, 32]} />
        <meshStandardMaterial color="#c9cdd2" roughness={0.22} metalness={0.85} envMapIntensity={1.2} />
      </mesh>
      {/* 道具：植物（挪到右后方，别跟台灯打架） */}
      <mesh position={[1.72, 1.02, -0.62]}>
        <sphereGeometry args={[0.19, 24, 18]} />
        <meshStandardMaterial color="#2f4a33" roughness={0.85} />
      </mesh>
      <mesh position={[1.72, 0.87, -0.62]}>
        <cylinderGeometry args={[0.055, 0.07, 0.16, 20]} />
        <meshStandardMaterial color="#3a2a20" roughness={0.8} />
      </mesh>

      {/* 台灯本体：一根细杆 + 一个小灯罩 */}
      <mesh position={[1.05, 1.08, 0.45]}>
        <cylinderGeometry args={[0.008, 0.008, 0.68, 12]} />
        <meshStandardMaterial color="#6e7278" roughness={0.55} metalness={0.55} />
      </mesh>
      <mesh position={[1.05, 1.42, 0.45]} rotation={[0.5, 0, 0]}>
        <coneGeometry args={[0.1, 0.13, 24, 1, true]} />
        <meshStandardMaterial color="#2a2f36" roughness={0.4} metalness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[1.05, 1.38, 0.47]}>
        <sphereGeometry args={[0.026, 16, 12]} />
        <meshBasicMaterial color="#ffd9a8" toneMapped={false} />
      </mesh>
    </>
  );
};
