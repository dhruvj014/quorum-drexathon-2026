import { useEffect, useRef } from "react";
import type { AttackRecord } from "./types";
import { OUTCOME_COLORS, outcomeOf } from "./types";

interface Props {
  attacks: AttackRecord[]; // already filtered to the visible rounds
  defender: string;
  onSelect: (key: string) => void;
}

// Organism state in dish coordinates: the dish is the unit circle centred on (0, 0).
interface Organism {
  key: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number; // radius in dish units
  phase: number;
  born: number; // ms timestamp when it starts entering
  fromX: number;
  fromY: number;
  entering: boolean;
}

const ENTER_MS = 1400;
const WAVE_STAGGER_MS = 45;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function makeOrganism(rec: AttackRecord, now: number, waveIndex: number): Organism {
  const a = hash(rec.key + "a");
  const b = hash(rec.key + "b");
  const c = hash(rec.key + "c");
  const angle = a * Math.PI * 2;
  const dist = Math.sqrt(b) * 0.82;
  const rimAngle = angle + (c - 0.5) * 0.6;
  const speed = 0.00002 + c * 0.00002;
  const dir = hash(rec.key + "d") * Math.PI * 2;
  return {
    key: rec.key,
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    vx: Math.cos(dir) * speed,
    vy: Math.sin(dir) * speed,
    r: rec.kind === "clean" ? 0.012 : 0.026 + c * 0.008,
    phase: a * 10,
    born: now + waveIndex * WAVE_STAGGER_MS,
    fromX: Math.cos(rimAngle) * 1.02,
    fromY: Math.sin(rimAngle) * 1.02,
    entering: true,
  };
}

function ease(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export default function Dish({ attacks, defender, onSelect }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orgs = useRef<Map<string, Organism>>(new Map());
  const recs = useRef<Map<string, AttackRecord>>(new Map());
  const defRef = useRef(defender);
  const geom = useRef({ cx: 0, cy: 0, R: 1, dpr: 1 });

  defRef.current = defender;

  // Sync organisms with records: add new ones (in waves by round), drop removed ones.
  useEffect(() => {
    const now = performance.now();
    const next = new Map<string, AttackRecord>();
    for (const a of attacks) next.set(a.key, a);
    for (const k of [...orgs.current.keys()]) if (!next.has(k)) orgs.current.delete(k);
    const perRound = new Map<number, number>();
    for (const a of attacks) {
      if (orgs.current.has(a.key)) continue;
      const i = perRound.get(a.round) ?? 0;
      perRound.set(a.round, i + 1);
      orgs.current.set(a.key, makeOrganism(a, now, i));
    }
    recs.current = next;
  }, [attacks]);

  // Canvas sizing.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      geom.current = { cx: w / 2, cy: h / 2, R: Math.max(10, Math.min(w, h) / 2 - 12), dpr };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Animation loop.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) draw(ctx, now, dt);
      raf = requestAnimationFrame(frame);
    };
    const draw = (ctx: CanvasRenderingContext2D, now: number, dt: number) => {
      const { cx, cy, R, dpr } = geom.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cx * 2, cy * 2);

      // Dish.
      const g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
      g.addColorStop(0, "#1a2129");
      g.addColorStop(1, "#12171d");
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#33404d";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, R - 6, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#232c36";
      ctx.stroke();

      const def = defRef.current;
      for (const o of orgs.current.values()) {
        const rec = recs.current.get(o.key);
        if (!rec) continue;
        if (now < o.born) continue;
        let px: number;
        let py: number;
        if (o.entering) {
          const t = Math.min(1, (now - o.born) / ENTER_MS);
          const e = ease(t);
          px = o.fromX + (o.x - o.fromX) * e;
          py = o.fromY + (o.y - o.fromY) * e;
          if (t >= 1) o.entering = false;
        } else {
          // Slow drift with a little wobble; bounce off the inner wall.
          o.x += o.vx * dt;
          o.y += o.vy * dt;
          const lim = 0.93 - o.r;
          const d = Math.hypot(o.x, o.y);
          if (d > lim) {
            const nx = o.x / d;
            const ny = o.y / d;
            const dot = o.vx * nx + o.vy * ny;
            if (dot > 0) {
              o.vx -= 2 * dot * nx;
              o.vy -= 2 * dot * ny;
            }
            o.x = nx * lim;
            o.y = ny * lim;
          }
          px = o.x + Math.sin(now / 1700 + o.phase) * 0.004;
          py = o.y + Math.cos(now / 2100 + o.phase) * 0.004;
        }
        const sx = cx + px * R;
        const sy = cy + py * R;
        const out = outcomeOf(rec, def);
        const color = OUTCOME_COLORS[out];
        const rad = Math.max(2, o.r * R);
        if (rec.kind === "clean") {
          ctx.beginPath();
          ctx.arc(sx, sy, rad, 0, Math.PI * 2);
          ctx.fillStyle = out === "error" ? OUTCOME_COLORS.error : out === "none" ? OUTCOME_COLORS.none : "#ffffff";
          ctx.fill();
          if (out === "false_alarm") {
            ctx.beginPath();
            ctx.arc(sx, sy, rad + 3, 0, Math.PI * 2);
            ctx.lineWidth = 2;
            ctx.strokeStyle = OUTCOME_COLORS.breach;
            ctx.stroke();
          }
        } else {
          const grad = ctx.createRadialGradient(sx, sy, rad * 0.15, sx, sy, rad);
          grad.addColorStop(0, color + "ee");
          grad.addColorStop(0.7, color + "99");
          grad.addColorStop(1, color + "00");
          ctx.beginPath();
          ctx.arc(sx, sy, rad, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(sx, sy, rad * 0.35, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { cx, cy, R } = geom.current;
    const mx = (e.clientX - rect.left - cx) / R;
    const my = (e.clientY - rect.top - cy) / R;
    let best: string | null = null;
    let bestD = Infinity;
    for (const o of orgs.current.values()) {
      if (o.entering) continue;
      const d = Math.hypot(o.x - mx, o.y - my);
      const hit = Math.max(o.r, 12 / R);
      if (d < hit && d < bestD) {
        best = o.key;
        bestD = d;
      }
    }
    if (best) onSelect(best);
  };

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} onClick={onClick} />
      {attacks.length === 0 && <div className="empty">Waiting for the first round</div>}
    </div>
  );
}
