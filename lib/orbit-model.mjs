const TAU = Math.PI * 2;
const NORMAL_ORBIT_SPEED = 1;
const HOVERED_ORBIT_SPEED = 0.35;

const clampUnit = (value) => Math.min(1, Math.max(0, Number(value) || 0));

export const ORBIT_DEFINITIONS = [
  { label: "策略", radiusX: 0.46, radiusY: 0.17, tiltDeg: 7, durationMs: 24_000, direction: 1, phase: 0.08, accent: "#27d8c2" },
  { label: "生意", radiusX: 0.38, radiusY: 0.27, tiltDeg: -28, durationMs: 31_000, direction: -1, phase: 2.4, accent: "#9ec5e7" },
  { label: "估值", radiusX: 0.29, radiusY: 0.39, tiltDeg: 38, durationMs: 27_000, direction: 1, phase: 1.1, accent: "#ffffff" },
  { label: "技术", radiusX: 0.24, radiusY: 0.44, tiltDeg: -8, durationMs: 35_000, direction: -1, phase: 4.2, accent: "#6ea5d6" },
  { label: "风控", radiusX: 0.43, radiusY: 0.33, tiltDeg: 58, durationMs: 39_000, direction: 1, phase: 5.1, accent: "#27d8c2" },
];

export function getOrbitAngle(orbit, elapsedMs, speed = 1) {
  return orbit.phase + orbit.direction * (elapsedMs / orbit.durationMs) * TAU * speed;
}

export function getOrbitPoint(orbit, angle, width, height) {
  const ellipseX = Math.cos(angle) * width * orbit.radiusX;
  const ellipseY = Math.sin(angle) * height * orbit.radiusY;
  const tilt = orbit.tiltDeg * Math.PI / 180;

  return {
    x: Math.round((width / 2 + ellipseX * Math.cos(tilt) - ellipseY * Math.sin(tilt)) * 1e6) / 1e6,
    y: Math.round((height / 2 + ellipseX * Math.sin(tilt) + ellipseY * Math.cos(tilt)) * 1e6) / 1e6,
  };
}

export function getCanvasPixelRatio(value) {
  return Math.min(2, Math.max(1, Number(value) || 1));
}

export function getOrbitDepth(pointY, height) {
  return Math.min(1, Math.max(0, pointY / Math.max(1, height)));
}

export function getOrbitSphereRadius(baseRadius, depth) {
  return Math.round((baseRadius - 1 + clampUnit(depth) * 7) * 1e4) / 1e4;
}

export function getOrbitHoverScale(progress) {
  const eased = 1 - (1 - clampUnit(progress)) ** 3;
  return Math.round((1 + eased * 0.12) * 1e6) / 1e6;
}

export function getOrbitVisualStyle(depth, hoverProgress) {
  const normalizedDepth = clampUnit(depth);
  const normalizedHover = clampUnit(hoverProgress);

  return {
    opacity: Math.round((0.68 + normalizedDepth * 0.32) * 1e4) / 1e4,
    shadowBlur: Math.round((12 + normalizedDepth * 10 + normalizedHover * 16) * 1e4) / 1e4,
    glowAlpha: Math.round((0.08 + normalizedHover * 0.64) * 1e4) / 1e4,
  };
}

export function isPointInOrbitSphere(pointer, sphere) {
  return Math.hypot(pointer.x - sphere.x, pointer.y - sphere.y) <= sphere.radius;
}

export function getOrbitHoverState(pointer, spheres) {
  const hoveredOrbit = pointer
    ? spheres
      .toSorted((left, right) => right.radius - left.radius)
      .find((sphere) => isPointInOrbitSphere(pointer, sphere))?.index ?? null
    : null;

  return { hoveredOrbit };
}

export function createOrbitMotionState(count = ORBIT_DEFINITIONS.length) {
  return Array.from({ length: Math.max(0, count) }, () => ({
    elapsedMs: 0,
    speed: NORMAL_ORBIT_SPEED,
    hoverProgress: 0,
  }));
}

export function setOrbitHoverProgress(states, hoveredOrbit) {
  return states.map((state, index) => ({
    ...state,
    hoverProgress: index === hoveredOrbit ? 1 : 0,
  }));
}

export function advanceOrbitMotion(states, hoveredOrbit, deltaMs) {
  const delta = Math.max(0, Number(deltaMs) || 0);
  const speedEase = Math.min(1, delta / 240);
  const hoverEase = Math.min(1, delta / 180);

  return states.map((state, index) => {
    const hovered = index === hoveredOrbit;
    const targetSpeed = hovered ? HOVERED_ORBIT_SPEED : NORMAL_ORBIT_SPEED;
    const speed = hovered
      ? state.speed + (targetSpeed - state.speed) * speedEase
      : NORMAL_ORBIT_SPEED;
    const targetHover = hovered ? 1 : 0;
    const hoverProgress = state.hoverProgress + (targetHover - state.hoverProgress) * hoverEase;

    return {
      elapsedMs: state.elapsedMs + delta * speed,
      speed,
      hoverProgress,
    };
  });
}
