import { useEffect, useRef, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

const CENTER = 120;
const POINT_COUNT = 20;
const TRANSITION_MS = 720;

type Mood = "waking" | "idle" | "happy" | "curious";

type MoodStep = {
  mood: Mood;
  duration: number;
};

type MoodShape = {
  eyeGap: number;
  eyeScaleLeft: number;
  eyeScaleRight: number;
  eyeTiltLeft: number;
  eyeTiltRight: number;
  rotation: number;
  skew: number;
  xScale: number;
  yScale: number;
};

type Point = {
  x: number;
  y: number;
};

const introStep: MoodStep = { mood: "waking", duration: 2_200 };
const loopSteps: readonly MoodStep[] = [
  { mood: "idle", duration: 6_800 },
  { mood: "happy", duration: 3_200 },
  { mood: "idle", duration: 7_400 },
  { mood: "curious", duration: 3_600 },
];

const moodShapes: Record<Mood, MoodShape> = {
  waking: {
    eyeGap: 25,
    eyeScaleLeft: 0.35,
    eyeScaleRight: 0.35,
    eyeTiltLeft: -8,
    eyeTiltRight: -8,
    rotation: 0,
    skew: 0,
    xScale: 0.96,
    yScale: 0.98,
  },
  idle: {
    eyeGap: 26,
    eyeScaleLeft: 1,
    eyeScaleRight: 1,
    eyeTiltLeft: -10,
    eyeTiltRight: -10,
    rotation: 0,
    skew: 0,
    xScale: 1,
    yScale: 1,
  },
  happy: {
    eyeGap: 28,
    eyeScaleLeft: 0.62,
    eyeScaleRight: 0.62,
    eyeTiltLeft: -20,
    eyeTiltRight: 12,
    rotation: -2,
    skew: -0.02,
    xScale: 1.035,
    yScale: 0.965,
  },
  curious: {
    eyeGap: 24,
    eyeScaleLeft: 1.14,
    eyeScaleRight: 0.78,
    eyeTiltLeft: -5,
    eyeTiltRight: -15,
    rotation: 4,
    skew: 0.055,
    xScale: 0.97,
    yScale: 1.025,
  },
};

const loopDuration = loopSteps.reduce((total, step) => total + step.duration, 0);

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function ease(value: number) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function mix(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function mixShape(from: MoodShape, to: MoodShape, amount: number): MoodShape {
  return {
    eyeGap: mix(from.eyeGap, to.eyeGap, amount),
    eyeScaleLeft: mix(from.eyeScaleLeft, to.eyeScaleLeft, amount),
    eyeScaleRight: mix(from.eyeScaleRight, to.eyeScaleRight, amount),
    eyeTiltLeft: mix(from.eyeTiltLeft, to.eyeTiltLeft, amount),
    eyeTiltRight: mix(from.eyeTiltRight, to.eyeTiltRight, amount),
    rotation: mix(from.rotation, to.rotation, amount),
    skew: mix(from.skew, to.skew, amount),
    xScale: mix(from.xScale, to.xScale, amount),
    yScale: mix(from.yScale, to.yScale, amount),
  };
}

function pathFromPoints(points: readonly Point[]) {
  const commands = points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const afterNext = points[(index + 2) % points.length];
    if (!previous || !next || !afterNext) return "";

    const controlOne = {
      x: point.x + (next.x - previous.x) / 6,
      y: point.y + (next.y - previous.y) / 6,
    };
    const controlTwo = {
      x: next.x - (afterNext.x - point.x) / 6,
      y: next.y - (afterNext.y - point.y) / 6,
    };

    return `C ${controlOne.x.toFixed(2)} ${controlOne.y.toFixed(2)} ${controlTwo.x.toFixed(2)} ${controlTwo.y.toFixed(2)} ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  });

  const first = points[0];
  return first ? `M ${first.x.toFixed(2)} ${first.y.toFixed(2)} ${commands.join(" ")} Z` : "";
}

function makeBodyPath(time: number, shape: MoodShape, pointerX: number) {
  const points: Point[] = [];
  const curiousPull = Math.abs(shape.rotation) / 4;

  for (let index = 0; index < POINT_COUNT; index += 1) {
    const angle = (index / POINT_COUNT) * Math.PI * 2;
    const ripple =
      Math.sin(angle * 3 + time * 0.68) * 0.023 +
      Math.sin(angle * 5 - time * 0.46) * 0.014 +
      Math.sin(angle * 7 + time * 0.31) * 0.008;
    const attention = Math.cos(angle) * pointerX * 0.018 * curiousPull;
    const radius = 88 * (1 + ripple + attention);
    const vertical = Math.sin(angle) * radius;

    points.push({
      x: CENTER + Math.cos(angle) * radius * shape.xScale + vertical * shape.skew,
      y: CENTER + vertical * shape.yScale,
    });
  }

  return pathFromPoints(points);
}

function currentStep(elapsed: number) {
  if (elapsed < introStep.duration) {
    return {
      current: introStep,
      previous: moodShapes.waking,
      progress: elapsed / introStep.duration,
    };
  }

  const elapsedAfterIntro = elapsed - introStep.duration;
  const firstLoop = elapsedAfterIntro < loopDuration;
  let loopElapsed = elapsedAfterIntro % loopDuration;
  for (let index = 0; index < loopSteps.length; index += 1) {
    const step = loopSteps[index];
    if (!step) continue;
    if (loopElapsed < step.duration) {
      const previousStep = index === 0 && firstLoop
        ? introStep
        : loopSteps[(index - 1 + loopSteps.length) % loopSteps.length];
      return {
        current: step,
        previous: moodShapes[previousStep?.mood ?? "idle"],
        progress: loopElapsed / step.duration,
      };
    }
    loopElapsed -= step.duration;
  }

  return { current: loopSteps[0] ?? introStep, previous: moodShapes.idle, progress: 0 };
}

const staticPath = makeBodyPath(0, moodShapes.idle, 0);

export function StatsConnectMascot({ className }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const bodyRef = useRef<SVGPathElement>(null);
  const faceRef = useRef<SVGGElement>(null);
  const leftEyeRef = useRef<SVGEllipseElement>(null);
  const rightEyeRef = useRef<SVGEllipseElement>(null);
  const pointerRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    const svg = svgRef.current;
    const body = bodyRef.current;
    const face = faceRef.current;
    const leftEye = leftEyeRef.current;
    const rightEye = rightEyeRef.current;
    if (!svg || !body || !face || !leftEye || !rightEye) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let visible = true;
    let previousMood: Mood | null = null;
    const startedAt = performance.now();

    const draw = (now: number) => {
      frame = 0;
      const elapsed = reducedMotion ? introStep.duration + 1_000 : now - startedAt;
      const seconds = elapsed / 1_000;
      const step = currentStep(elapsed);
      const transition = ease(step.progress * (step.current.duration / TRANSITION_MS));
      const shape = mixShape(step.previous, moodShapes[step.current.mood], transition);
      const pointer = pointerRef.current;

      pointer.x += (pointer.targetX - pointer.x) * 0.075;
      pointer.y += (pointer.targetY - pointer.y) * 0.075;

      const breathing = 1 + Math.sin(seconds * 1.35) * 0.008;
      const wakeScale = step.current.mood === "waking" ? 0.86 + ease(step.progress) * 0.14 : 1;
      const bounce = step.current.mood === "happy" ? Math.sin(seconds * 3.6) * 1.8 : 0;
      const blinkCycle = (seconds + 0.7) % 5.4;
      const blink = blinkCycle < 0.16 ? 1 - Math.sin((blinkCycle / 0.16) * Math.PI) * 0.92 : 1;
      const gazeX = pointer.x * 6.5;
      const gazeY = pointer.y * 4.5;

      body.setAttribute("d", makeBodyPath(seconds, shape, pointer.x));
      face.setAttribute(
        "transform",
        `translate(${CENTER} ${CENTER + bounce}) rotate(${shape.rotation.toFixed(2)}) scale(${(breathing * wakeScale).toFixed(4)}) translate(${-CENTER} ${-CENTER})`,
      );

      const eyeY = 94 + gazeY;
      const leftX = CENTER - shape.eyeGap + gazeX;
      const rightX = CENTER + shape.eyeGap + gazeX;

      leftEye.setAttribute("cx", leftX.toFixed(2));
      leftEye.setAttribute("cy", eyeY.toFixed(2));
      leftEye.setAttribute("ry", (18 * shape.eyeScaleLeft * blink).toFixed(2));
      leftEye.setAttribute("transform", `rotate(${shape.eyeTiltLeft.toFixed(2)} ${leftX.toFixed(2)} ${eyeY.toFixed(2)})`);

      rightEye.setAttribute("cx", rightX.toFixed(2));
      rightEye.setAttribute("cy", eyeY.toFixed(2));
      rightEye.setAttribute("ry", (18 * shape.eyeScaleRight * blink).toFixed(2));
      rightEye.setAttribute("transform", `rotate(${shape.eyeTiltRight.toFixed(2)} ${rightX.toFixed(2)} ${eyeY.toFixed(2)})`);

      if (previousMood !== step.current.mood) {
        svg.dataset.state = step.current.mood;
        previousMood = step.current.mood;
      }

      if (!reducedMotion && visible) frame = requestAnimationFrame(draw);
    };

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      visible = entry.isIntersecting;
      if (visible && !reducedMotion && !frame) frame = requestAnimationFrame(draw);
      if (!visible && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });

    observer.observe(svg);
    frame = requestAnimationFrame(draw);

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const trackPointer = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerRef.current.targetX = clamp(((event.clientX - bounds.left) / bounds.width - 0.5) * 2, -1, 1);
    pointerRef.current.targetY = clamp(((event.clientY - bounds.top) / bounds.height - 0.5) * 2, -1, 1);
  };

  return (
    <div
      className={cn("statsconnect-mascot", className)}
      onPointerMove={trackPointer}
      onPointerLeave={() => {
        pointerRef.current.targetX = 0;
        pointerRef.current.targetY = 0;
      }}
      aria-hidden="true"
    >
      <svg
        ref={svgRef}
        className="statsconnect-mascot__svg"
        data-state="waking"
        viewBox="0 0 240 240"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g ref={faceRef}>
          <path ref={bodyRef} className="statsconnect-mascot__body" d={staticPath} />
          <g className="statsconnect-mascot__eyes">
            <ellipse ref={leftEyeRef} cx="94" cy="94" rx="8" ry="18" transform="rotate(-10 94 94)" />
            <ellipse ref={rightEyeRef} cx="146" cy="94" rx="8" ry="18" transform="rotate(-10 146 94)" />
          </g>
        </g>
      </svg>
    </div>
  );
}
