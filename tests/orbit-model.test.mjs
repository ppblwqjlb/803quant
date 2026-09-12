import assert from "node:assert/strict";
import test from "node:test";

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
  isPointInOrbitSphere,
  setOrbitHoverProgress,
} from "../lib/orbit-model.mjs";

test("five research dimensions use independent elliptical orbits", () => {
  assert.deepEqual(
    ORBIT_DEFINITIONS.map(({ label }) => label),
    ["策略", "生意", "估值", "技术", "风控"],
  );
  assert.equal(new Set(ORBIT_DEFINITIONS.map(({ durationMs }) => durationMs)).size, 5);
  assert.deepEqual(
    new Set(ORBIT_DEFINITIONS.map(({ direction }) => direction)),
    new Set([1, -1]),
  );
});

test("orbit angle follows elapsed time, direction and hover speed", () => {
  const orbit = { phase: 0, direction: 1, durationMs: 20_000 };
  assert.equal(getOrbitAngle(orbit, 5_000, 1), Math.PI / 2);
  assert.equal(getOrbitAngle({ ...orbit, direction: -1 }, 5_000, 1), -Math.PI / 2);
  assert.equal(getOrbitAngle(orbit, 5_000, 0.35), Math.PI * 0.175);
});

test("ellipse points are centered, tilted and responsive", () => {
  const orbit = { radiusX: 0.4, radiusY: 0.2, tiltDeg: 0 };
  assert.deepEqual(getOrbitPoint(orbit, 0, 1000, 600), { x: 900, y: 300 });
  assert.deepEqual(getOrbitPoint(orbit, Math.PI / 2, 1000, 600), { x: 500, y: 420 });

  const tilted = getOrbitPoint({ ...orbit, tiltDeg: 90 }, 0, 1000, 600);
  assert.deepEqual(tilted, { x: 500, y: 700 });
});

test("canvas pixel ratio is clamped between one and two", () => {
  assert.equal(getCanvasPixelRatio(0.75), 1);
  assert.equal(getCanvasPixelRatio(1.5), 1.5);
  assert.equal(getCanvasPixelRatio(3), 2);
  assert.equal(getCanvasPixelRatio(Number.NaN), 1);
});

test("normal orbit sphere diameters stay within the 56 to 70 pixel range", () => {
  assert.equal(getOrbitDepth(0, 600), 0);
  assert.equal(getOrbitDepth(600, 600), 1);
  assert.equal(getOrbitDepth(900, 600), 1);
  assert.equal(getOrbitDepth(-30, 600), 0);
  assert.equal(getOrbitSphereRadius(29, 0) * 2, 56);
  assert.equal(getOrbitSphereRadius(29, 1) * 2, 70);

  for (const depth of [0, 0.25, 0.5, 0.75, 1]) {
    const diameter = getOrbitSphereRadius(29, depth) * 2;
    assert.ok(diameter >= 56 && diameter <= 70);
  }
});

test("depth and hover progress interpolate sphere finish instead of jumping", () => {
  assert.equal(getOrbitHoverScale(0), 1);
  assert.equal(getOrbitHoverScale(1), 1.12);
  assert.ok(getOrbitHoverScale(0.5) > 1);
  assert.ok(getOrbitHoverScale(0.5) < 1.12);

  const rear = getOrbitVisualStyle(0, 0);
  const front = getOrbitVisualStyle(1, 0);
  const hoveredFront = getOrbitVisualStyle(1, 0.5);
  assert.ok(front.opacity > rear.opacity);
  assert.ok(front.shadowBlur > rear.shadowBlur);
  assert.ok(hoveredFront.shadowBlur > front.shadowBlur);
});

test("orbit sphere hit testing uses its visible circular boundary", () => {
  const sphere = { x: 100, y: 100, radius: 30 };

  assert.equal(isPointInOrbitSphere({ x: 120, y: 110 }, sphere), true);
  assert.equal(isPointInOrbitSphere({ x: 130, y: 100 }, sphere), true);
  assert.equal(isPointInOrbitSphere({ x: 132, y: 100 }, sphere), false);
});

test("pointer hit selects one visible sphere and slows its orbit", () => {
  const spheres = [
    { index: 1, x: 100, y: 100, radius: 18 },
    { index: 4, x: 104, y: 100, radius: 30 },
  ];

  assert.deepEqual(
    getOrbitHoverState({ x: 104, y: 100 }, spheres),
    { hoveredOrbit: 4 },
  );
});

test("pointer miss inside the canvas restores normal orbit speed", () => {
  const spheres = [{ index: 4, x: 104, y: 100, radius: 30 }];

  assert.deepEqual(
    getOrbitHoverState({ x: 160, y: 100 }, spheres),
    { hoveredOrbit: null },
  );
});

test("hovering one sphere slows only that orbit while others keep normal angular time", () => {
  const initial = createOrbitMotionState(3);
  const next = advanceOrbitMotion(initial, 1, 120);

  assert.equal(next[0].elapsedMs, 120);
  assert.equal(next[2].elapsedMs, 120);
  assert.ok(next[1].elapsedMs < 120);
  assert.ok(next[1].speed > 0.35 && next[1].speed < 1);
  assert.equal(next[0].speed, 1);
  assert.equal(next[2].speed, 1);
});

test("a previously slowed orbit resumes normal time immediately when hover leaves or switches", () => {
  const slowed = advanceOrbitMotion(createOrbitMotionState(2), 0, 120);

  const afterLeave = advanceOrbitMotion(slowed, null, 40);
  assert.equal(afterLeave[0].elapsedMs - slowed[0].elapsedMs, 40);
  assert.equal(afterLeave[0].speed, 1);

  const afterSwitch = advanceOrbitMotion(slowed, 1, 40);
  assert.equal(afterSwitch[0].elapsedMs - slowed[0].elapsedMs, 40);
  assert.equal(afterSwitch[0].speed, 1);
  assert.ok(afterSwitch[1].elapsedMs - slowed[1].elapsedMs < 40);
  assert.ok(afterSwitch[1].speed < 1);
});

test("reduced-motion hover maps the selected sphere to full progress without moving orbits", () => {
  const states = [
    { elapsedMs: 30, speed: 0.6, hoverProgress: 0.4 },
    { elapsedMs: 80, speed: 1, hoverProgress: 0 },
    { elapsedMs: 140, speed: 0.8, hoverProgress: 0.2 },
  ];

  assert.deepEqual(setOrbitHoverProgress(states, 1), [
    { elapsedMs: 30, speed: 0.6, hoverProgress: 0 },
    { elapsedMs: 80, speed: 1, hoverProgress: 1 },
    { elapsedMs: 140, speed: 0.8, hoverProgress: 0 },
  ]);
  assert.deepEqual(setOrbitHoverProgress(states, null), [
    { elapsedMs: 30, speed: 0.6, hoverProgress: 0 },
    { elapsedMs: 80, speed: 1, hoverProgress: 0 },
    { elapsedMs: 140, speed: 0.8, hoverProgress: 0 },
  ]);
});

test("hover enlargement advances and recedes through intermediate progress", () => {
  const initial = createOrbitMotionState(1);
  const entering = advanceOrbitMotion(initial, 0, 60);
  assert.ok(entering[0].hoverProgress > 0 && entering[0].hoverProgress < 1);

  const leaving = advanceOrbitMotion(entering, null, 30);
  assert.ok(leaving[0].hoverProgress > 0);
  assert.ok(leaving[0].hoverProgress < entering[0].hoverProgress);
});
