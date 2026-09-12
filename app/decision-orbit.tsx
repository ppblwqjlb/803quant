"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import { Layers3 } from "lucide-react";
import {
  ORBIT_DEFINITIONS,
  advanceOrbitMotion,
  createOrbitMotionState,
  getCanvasPixelRatio,
  getOrbitAngle,
  getOrbitDepth,
  getOrbitHoverScale,
  getOrbitHoverState,
  getOrbitPoint,
  getOrbitSphereRadius,
  getOrbitVisualStyle,
  setOrbitHoverProgress,
} from "../lib/orbit-model.mjs";

type OrbitSphere = {
  index: number;
  x: number;
  y: number;
  radius: number;
  depth: number;
  hoverProgress: number;
};

type OrbitMotionState = {
  elapsedMs: number;
  speed: number;
  hoverProgress: number;
};

function drawSphere(
  context: CanvasRenderingContext2D,
  sphere: OrbitSphere,
  label: string,
  accent: string,
) {
  const radius = sphere.radius;
  const visual = getOrbitVisualStyle(sphere.depth, sphere.hoverProgress);
  const gradient = context.createRadialGradient(
    sphere.x - radius * 0.3,
    sphere.y - radius * 0.34,
    radius * 0.08,
    sphere.x,
    sphere.y,
    radius,
  );
  gradient.addColorStop(0, "rgba(255, 255, 255, .92)");
  gradient.addColorStop(0.2, accent);
  gradient.addColorStop(0.66, "#18344d");
  gradient.addColorStop(1, "#07101d");

  context.save();
  if (sphere.hoverProgress > 0.001) {
    const halo = context.createRadialGradient(
      sphere.x,
      sphere.y,
      radius * 0.82,
      sphere.x,
      sphere.y,
      radius * 1.48,
    );
    halo.addColorStop(0, `rgba(117, 227, 245, ${visual.glowAlpha})`);
    halo.addColorStop(1, "rgba(117, 227, 245, 0)");
    context.fillStyle = halo;
    context.beginPath();
    context.arc(sphere.x, sphere.y, radius * 1.48, 0, Math.PI * 2);
    context.fill();
  }

  context.globalAlpha = visual.opacity;
  context.shadowColor = sphere.hoverProgress > 0.001 ? "rgba(117, 227, 245, .82)" : accent;
  context.shadowBlur = visual.shadowBlur;
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(sphere.x, sphere.y, radius, 0, Math.PI * 2);
  context.fill();

  context.shadowBlur = 0;
  context.lineWidth = 2;
  context.strokeStyle = "rgba(224, 248, 255, .58)";
  context.beginPath();
  context.arc(sphere.x, sphere.y, radius - 1, Math.PI * 0.92, Math.PI * 1.96);
  context.stroke();
  context.lineWidth = 1;
  context.strokeStyle = "rgba(39, 216, 194, .7)";
  context.beginPath();
  context.arc(sphere.x, sphere.y, radius - 3.5, Math.PI * 1.08, Math.PI * 1.78);
  context.stroke();

  context.fillStyle = "#f4fbff";
  context.font = '600 14px "Microsoft YaHei", sans-serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, sphere.x, sphere.y + 0.5);
  context.restore();
}

function drawScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  motions: OrbitMotionState[],
) {
  context.clearRect(0, 0, width, height);

  const glow = context.createRadialGradient(
    width / 2,
    height / 2,
    20,
    width / 2,
    height / 2,
    Math.min(width, height) * 0.44,
  );
  glow.addColorStop(0, "rgba(39, 216, 194, .17)");
  glow.addColorStop(0.42, "rgba(12, 50, 82, .25)");
  glow.addColorStop(1, "rgba(6, 9, 17, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  const spheres = ORBIT_DEFINITIONS.map((orbit, index) => {
    context.save();
    context.translate(width / 2, height / 2);
    context.rotate(orbit.tiltDeg * Math.PI / 180);
    context.beginPath();
    context.ellipse(0, 0, width * orbit.radiusX, height * orbit.radiusY, 0, 0, Math.PI * 2);
    context.strokeStyle = orbit.accent === "#27d8c2"
      ? "rgba(39, 216, 194, .36)"
      : "rgba(134, 169, 204, .32)";
    context.lineWidth = 1.25;
    context.stroke();
    context.restore();

    const motion = motions[index];
    const point = getOrbitPoint(orbit, getOrbitAngle(orbit, motion.elapsedMs, 1), width, height);
    const depth = getOrbitDepth(point.y, height);
    const hoverProgress = motion.hoverProgress;
    return {
      index,
      x: point.x,
      y: point.y,
      radius: getOrbitSphereRadius(29, depth) * getOrbitHoverScale(hoverProgress),
      depth,
      hoverProgress,
    };
  });

  for (const sphere of spheres.toSorted((a, b) => a.y - b.y)) {
    const orbit = ORBIT_DEFINITIONS[sphere.index];
    drawSphere(context, sphere, orbit.label, orbit.accent);
  }

  return spheres;
}

export function DecisionOrbit() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoveredOrbitRef = useRef<number | null>(null);
  const spheresRef = useRef<OrbitSphere[]>([]);
  const updateHoverRef = useRef<(hoveredOrbit: number | null) => void>((hoveredOrbit) => {
    hoveredOrbitRef.current = hoveredOrbit;
  });

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!host || !canvas || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frameId = 0;
    let width = 0;
    let height = 0;
    let inViewport = true;
    let documentVisible = document.visibilityState === "visible";
    let motions = createOrbitMotionState(ORBIT_DEFINITIONS.length) as OrbitMotionState[];
    let previousTime = performance.now();

    const draw = () => {
      const ratio = getCanvasPixelRatio(window.devicePixelRatio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      spheresRef.current = drawScene(context, width, height, motions);
    };
    updateHoverRef.current = (hoveredOrbit) => {
      hoveredOrbitRef.current = hoveredOrbit;
      if (reducedMotion.matches) {
        motions = setOrbitHoverProgress(motions, hoveredOrbit) as OrbitMotionState[];
      }
      draw();
    };

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      const ratio = getCanvasPixelRatio(window.devicePixelRatio);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      draw();
    };

    const shouldAnimate = () => inViewport && documentVisible && !reducedMotion.matches;

    const animate = (time: number) => {
      const delta = Math.min(48, Math.max(0, time - previousTime));
      previousTime = time;
      motions = advanceOrbitMotion(motions, hoveredOrbitRef.current, delta) as OrbitMotionState[];
      draw();
      frameId = shouldAnimate() ? requestAnimationFrame(animate) : 0;
    };

    const syncAnimation = () => {
      documentVisible = document.visibilityState === "visible";
      cancelAnimationFrame(frameId);
      frameId = 0;
      previousTime = performance.now();
      if (reducedMotion.matches) {
        motions = setOrbitHoverProgress(motions, hoveredOrbitRef.current) as OrbitMotionState[];
      }
      if (shouldAnimate()) frameId = requestAnimationFrame(animate);
      else draw();
    };

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting;
      syncAnimation();
    });

    resizeObserver.observe(host);
    intersectionObserver.observe(host);
    document.addEventListener("visibilitychange", syncAnimation);
    reducedMotion.addEventListener("change", syncAnimation);
    resize();
    syncAnimation();

    return () => {
      cancelAnimationFrame(frameId);
      updateHoverRef.current = (hoveredOrbit) => {
        hoveredOrbitRef.current = hoveredOrbit;
      };
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", syncAnimation);
      reducedMotion.removeEventListener("change", syncAnimation);
    };
  }, []);

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const hoverState = getOrbitHoverState(pointer, spheresRef.current);
    updateHoverRef.current(hoverState.hoveredOrbit);
  };

  const clearHover = () => {
    const hoverState = getOrbitHoverState(null, spheresRef.current);
    updateHoverRef.current(hoverState.hoveredOrbit);
  };

  return (
    <div
      ref={hostRef}
      className="decision-orbit"
      onPointerMove={onPointerMove}
      onPointerLeave={clearHover}
    >
      <canvas
        ref={canvasRef}
        className="decision-orbit-canvas"
        role="img"
        aria-label="策略、生意、估值、技术与风控围绕决策中心持续运行"
      >
        Canvas 不可用：多维研究共同支持决策。
      </canvas>
      <div className="decision-orbit-core" aria-hidden="true">
        <Layers3 size={28} />
        <strong>决策</strong>
        <small>多维验证</small>
      </div>
    </div>
  );
}
