/**
 * 旋转地球 - 超现实风格 3D 场景
 * 
 * 使用 @remotion/three + @react-three/drei
 * 包含：地球球体 + 大气辉光 + 星空背景
 */

import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Sphere, Stars, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

interface RotatingEarthProps {
  rotationSpeed?: number;
  showAtmosphere?: boolean;
  showStars?: boolean;
}

// 地球材质 - 程序化生成（蓝色渐变 + 白色大陆）
function createEarthMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vNormal;
      
      // 简单的噪声函数
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      
      void main() {
        // 基础海洋颜色
        vec3 oceanColor = vec3(0.1, 0.3, 0.6);
        
        // 大陆颜色（用噪声模拟）
        float continent = noise(vUv * 8.0 + time * 0.1);
        continent = smoothstep(0.4, 0.6, continent);
        vec3 landColor = vec3(0.2, 0.5, 0.3);
        
        // 混合
        vec3 baseColor = mix(oceanColor, landColor, continent);
        
        // 光照
        float light = dot(vNormal, vec3(0.0, 0.0, 1.0));
        light = max(0.2, light);
        
        gl_FragColor = vec4(baseColor * light, 1.0);
      }
    `,
  });
}

// 大气层辉光
function Atmosphere() {
  return (
    <Sphere args={[1.15, 64, 64]}>
      <meshBasicMaterial
        color="#4a90e2"
        transparent
        opacity={0.15}
        side={THREE.BackSide}
      />
    </Sphere>
  );
}

// 地球主体
function Earth({ rotationSpeed = 0.002 }: { rotationSpeed?: number }) {
  const earthRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  useFrame((state) => {
    if (earthRef.current) {
      earthRef.current.rotation.y += rotationSpeed;
    }
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
    }
  });

  const material = createEarthMaterial();

  return (
    <group>
      {/* 地球球体 */}
      <Sphere ref={earthRef} args={[1, 64, 64]}>
        <primitive object={material} attach="material" ref={materialRef} />
      </Sphere>
      {/* 大气层 */}
      <Atmosphere />
    </group>
  );
}

export const RotatingEarth: React.FC<RotatingEarthProps> = ({
  rotationSpeed = 0.002,
  showAtmosphere = true,
  showStars = true,
}) => {
  return (
    <group>
      {/* 环境光 */}
      <ambientLight intensity={0.3} />
      {/* 主光源（模拟太阳） */}
      <directionalLight position={[5, 3, 5]} intensity={1} />
      {/* 地球 */}
      <Earth rotationSpeed={rotationSpeed} />
      {/* 星空背景 */}
      {showStars && (
        <Stars
          radius={100}
          depth={50}
          count={5000}
          factor={4}
          saturation={0}
          fade
          speed={1}
        />
      )}
    </group>
  );
};
