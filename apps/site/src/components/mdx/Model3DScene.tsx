// apps/site/src/components/mdx/Model3DScene.tsx
// The heavy r3f scene, lazy-imported by Model3D ONLY when allowed + visible, so
// three.js never lands on first paint. A gyroid-approximating strut lattice (the
// infill geometry of a 3D-printed part) you can drag to rotate.
//
// Perf contract (art-direction §6):
//  • DPR capped at 1.5
//  • frameloop="demand" — zero idle GPU; renders only on drag (OrbitControls
//    calls invalidate) or while the auto-rotate loop is active and visible
//  • paused when scrolled offscreen (IntersectionObserver flips a shared ref;
//    re-entering invalidates to resume)
//  • one InstancedMesh draw call for the whole lattice
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/** Gyroid implicit surface sign — sin x cos y + sin y cos z + sin z cos x. */
function gyroid(x: number, y: number, z: number): number {
  return Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(z) + Math.sin(z) * Math.cos(x);
}

/**
 * Build lattice node positions on a grid, keeping only nodes near the gyroid
 * iso-surface (|gyroid| < band) — that thin shell IS the printed infill wall.
 */
function latticeNodes(detail: number): THREE.Vector3[] {
  const nodes: THREE.Vector3[] = [];
  const n = Math.max(6, Math.min(22, Math.floor(detail)));
  const scale = (Math.PI * 2) / n;
  const band = 0.55;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        const x = i * scale;
        const y = j * scale;
        const z = k * scale;
        if (Math.abs(gyroid(x, y, z)) < band) {
          nodes.push(new THREE.Vector3(i - n / 2, j - n / 2, k - n / 2).multiplyScalar(0.16));
        }
      }
    }
  }
  return nodes;
}

/** Shared mutable visibility flag, set by the IntersectionObserver. */
type Visible = { current: boolean };

function Lattice({ detail, visible }: { detail: number; visible: Visible }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const nodes = useMemo(() => latticeNodes(detail), [detail]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    nodes.forEach((p, idx) => {
      dummy.position.copy(p);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    invalidate();
  }, [nodes, invalidate]);

  // Slow auto-rotate only while visible; demand-driven, so we invalidate the
  // frames we actually move. When offscreen we simply stop requesting frames.
  useFrame((_, dt) => {
    if (!visible.current || !group.current) return;
    group.current.rotation.y += dt * 0.18;
    invalidate();
  });

  return (
    <group ref={group}>
      <instancedMesh ref={ref} args={[undefined, undefined, nodes.length]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial
          color={"#ffb627"}
          emissive={"#7a4f0d"}
          emissiveIntensity={0.4}
          roughness={0.35}
          metalness={0.2}
        />
      </instancedMesh>
    </group>
  );
}

/** Bridge: lets the outer IntersectionObserver resume the demand loop. */
function VisibilityResumer({ visible }: { visible: Visible }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    // Re-render once on mount so the first frame paints under demand mode.
    invalidate();
    let raf = 0;
    let last = visible.current;
    const poll = () => {
      if (visible.current && !last) invalidate(); // resumed → kick the loop
      last = visible.current;
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [invalidate, visible]);
  return null;
}

export default function Model3DScene({ detail = 16 }: { detail?: number }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const visible = useRef(true);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        visible.current = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="m3d-canvas-wrap" ref={wrapRef}>
      <Canvas
        className="m3d-canvas"
        dpr={[1, 1.5]}
        frameloop="demand"
        camera={{ position: [2.4, 1.8, 2.4], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[3, 4, 2]} intensity={0.9} color={"#ffd98a"} />
        <directionalLight position={[-3, -2, -1]} intensity={0.25} color={"#c1554a"} />
        <Lattice detail={detail} visible={visible} />
        <VisibilityResumer visible={visible} />
        <OrbitControls enablePan={false} enableZoom={false} rotateSpeed={0.8} />
      </Canvas>
    </div>
  );
}
