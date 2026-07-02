// apps/site/src/components/mdx/Model3DGlbScene.tsx
// Model3D v2 glb path (design §4.8) — the heavy r3f scene used ONLY when a
// <Model3D src="…glb"> is given a committed local model. Like Model3DScene, this
// is lazy-imported by the thin Model3D shell so three.js never lands on first
// paint. It loads the asset with drei's useGLTF and lets the reader drag to
// rotate (OrbitControls), sharing the same perf contract as the gyroid scene:
//  • DPR capped at 1.5
//  • frameloop="demand" — zero idle GPU; renders only on drag, or per auto-rotate
//    frame while visible
//  • paused when scrolled offscreen (IntersectionObserver flips a shared ref)
//  • auto-rotate is OPT-IN and never runs under prefers-reduced-motion (drag
//    always allowed)
//
// Asset-size discipline (the founder's concern): this loader renders whatever
// glb/gltf it is handed — the budget is enforced by the AUTHOR, not the runtime.
// Recommended: keep the committed model < ~1–2 MB (ideally far less); prefer
// Draco/meshopt-free, low-poly, single-material parts. The demo gear this ships
// with is ~17 KB.
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, Center, Bounds } from "@react-three/drei";
import { useEffect, useRef } from "react";
import type { Group } from "three";

type Visible = { current: boolean };

function Model({
  src,
  autoRotate,
  visible,
}: {
  src: string;
  autoRotate: boolean;
  visible: Visible;
}) {
  const group = useRef<Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const { scene } = useGLTF(src);

  // Paint the first frame once the model resolves (demand mode needs a kick).
  useEffect(() => {
    invalidate();
  }, [invalidate, scene]);

  // Slow auto-rotate only while visible AND allowed (reduced-motion disables it
  // at the call site by passing autoRotate=false). Demand-driven: we invalidate
  // exactly the frames we move; offscreen we simply stop requesting frames.
  useFrame((_, dt) => {
    if (!autoRotate || !visible.current || !group.current) return;
    group.current.rotation.y += dt * 0.18;
    invalidate();
  });

  return (
    <Bounds fit clip observe margin={1.1}>
      <group ref={group}>
        <Center>
          <primitive object={scene} />
        </Center>
      </group>
    </Bounds>
  );
}

/** Bridge: lets the outer IntersectionObserver resume the demand loop. */
function VisibilityResumer({ visible }: { visible: Visible }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
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

export default function Model3DGlbScene({
  src,
  autoRotate = false,
}: {
  src: string;
  autoRotate?: boolean;
}) {
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
        <Model src={src} autoRotate={autoRotate} visible={visible} />
        <VisibilityResumer visible={visible} />
        <OrbitControls enablePan={false} enableZoom={false} rotateSpeed={0.8} />
      </Canvas>
    </div>
  );
}
