// Written with AI assistance (Claude Code)
// The engine behind BurnFlow: photo cards are born inside a ring that lies flat at the back of the scene, climb
// its inner wall out of sight, bend over its crest and are let go into a free flight that carries them outward
// and toward the viewer, where they leave the frame.
//   Ring: a torus seen face-on. Its screen radius and tube thickness scale with the shorter side of the stage;
//   depth puts it at a little over half size. While a card is on the tube, every vertex sits at its own arc
//   length along the tube's profile, so the card wraps over the rim instead of pivoting as a flat plate.
//   Flight: once released (a fixed angle past the crest), the card follows a smooth curve to its exit point,
//   while it turns its face toward the viewer, tumbles slowly, slips sideways, and curls and flutters like a
//   sheet of paper in moving air. The hand-over from tube to flight is blended over a short time.
//   Pointer (mouse only): a soft force field pushes nearby cards; each card answers through damped springs,
//   tips away from the push, and bends harder when it is thrown fast.
//   Final pass: cards over the stage ground, the hole of the ring filled with light (cards come out of white),
//   and a fixed one-step dither so the light gradient does not band. No refraction, no colour splitting.
// WebGL 2, no libraries. Reduced motion: one composed still (the flow run forward in time, drawn once).
// No WebGL 2: the same still drawn with the 2D canvas. It stops off screen, in hidden tabs and while paused.

export type Picture = HTMLImageElement | HTMLCanvasElement | ImageBitmap;
export type FlowOptions = {
  pictures: Picture[];
  ground: string;      // stage ground colour, #rrggbb
  count: number; phoneCount: number; phoneWidth: number;
  aspect: number; texture: [number, number];
  noWebGL: boolean;
};
const DEFAULTS: FlowOptions = {
  pictures: [], ground: "#f1f4f9", count: 20, phoneCount: 12, phoneWidth: 700,
  aspect: 720 / 1053, texture: [512, 748], noWebGL: false,
};
// scene layout and feel; tuned by eye against a reference recording, not physical quantities
const K = {
  ringR: 0.312, ringRMin: 110, ringRMax: 350, tube: 0.11, tubeMin: 39, tubeMax: 125,
  card: 325, cardMin: 0.55, cardMax: 1.15, near: [0.7, 1.2] as const,
  firstAt: 0.6, burstTimes: 1.8, burstUntil: 2.6, rushTimes: 6, rushOver: 2.5, release: 0.4, appearIn: 0.8,
  push: 1950, pushGain: 4.4, along: 4.8, speedCap: 2000, fieldMin: 190, field: 0.42, felt: 8,
  springPeriod: 1.15, springZeta: 0.56, throwAt: 520, throwBend: 1.5, curlRate: 3,
  maxDpr: 2, phoneMaxDpr: 1.5, warm: 14, seed: 5,
};
const EYE = 1000;                     // the eye stands EYE px in front of the picture plane; 1 unit = 1 px at depth 0
const DEPTH = 0.55;                   // the ring is drawn at this fraction of its size
const LET_GO = (50 * Math.PI) / 180;  // the card leaves the tube this far past the crest
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function seeded(seed: number) {
  let t = seed | 0;
  return () => { t = (t + 0x6d2b79f5) | 0; let r = Math.imul(t ^ (t >>> 15), t | 1); r ^= r + Math.imul(r ^ (r >>> 7), r | 61); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
// travel along the path over time: it pulls away from rest (ramp), then slows as it nears the viewer (coast)
const ramp = (t: number) => t - 2 * (1 - Math.exp(-t / 2));
const rampInv = (y: number) => { let a = 0, b = y + 2; for (let i = 0; i < 48; i++) { const m = (a + b) / 2; if (ramp(m) < y) a = m; else b = m; } return (a + b) / 2; };
const COAST = 1.35 ** 0.6 - 0.35 ** 0.6;
const coast = (u: number) => ((u + 0.35) ** 0.6 - 0.35 ** 0.6) / COAST;
const coastInv = (y: number) => (y * COAST + 0.35 ** 0.6) ** (1 / 0.6) - 0.35;
const hermite = (p0: number, m0: number, p1: number, m1: number, t: number) => {
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (3 * t2 - 2 * t3) * p1 + (t3 - t2) * m1;
};
const scaleAt = (z: number) => EYE / (EYE - z);
// a point on the tube's profile at arc length s from the lip: up the inner wall, round the crest, then straight on
function tubePoint(s: number, mid: number, f: number) {
  const arc = f * (Math.PI - LET_GO);
  if (s < 0) return { rho: mid - f, z: s };
  const t = Math.PI - Math.min(s, arc) / f, past = Math.max(0, s - arc);
  return { rho: mid + f * Math.cos(t) + past * Math.sin(t), z: f * Math.sin(t) - past * Math.cos(t) };
}

// rotations as quaternions [x, y, z, w]
type Quat = [number, number, number, number];
type Vec3 = [number, number, number];
const qmul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qaxis = (x: number, y: number, z: number, ang: number): Quat => { const s = Math.sin(ang / 2); return [x * s, y * s, z * s, Math.cos(ang / 2)]; };
const qrot = (v: Vec3): Quat => { const a = Math.hypot(v[0], v[1], v[2]); if (a < 1e-9) return [0, 0, 0, 1]; const s = Math.sin(a / 2) / a; return [v[0] * s, v[1] * s, v[2] * s, Math.cos(a / 2)]; };
function qframe(X: Vec3, Y: Vec3, Z: Vec3): Quat {   // the rotation that takes the unit axes to X, Y, Z
  const m00 = X[0], m10 = X[1], m20 = X[2], m01 = Y[0], m11 = Y[1], m21 = Y[2], m02 = Z[0], m12 = Z[1], m22 = Z[2], tr = m00 + m11 + m22;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; return [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s]; }
  if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2; return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
}
const turn = (q: Quat, v: Vec3): Vec3 => {
  const [x, y, z, w] = q, cx = y * v[2] - z * v[1] + w * v[0], cy = z * v[0] - x * v[2] + w * v[1], cz = x * v[1] - y * v[0] + w * v[2];
  return [v[0] + 2 * (y * cz - z * cy), v[1] + 2 * (z * cx - x * cz), v[2] + 2 * (x * cy - y * cx)];
};
type Spring = { x: number; v: number };
// one implicit step of a damped spring toward force f (angular rate w, damping z); stable for any dt
function springStep(st: Spring, f: number, dt: number, w: number, z: number) {
  st.v = clamp((st.v + (f - w * w * st.x) * dt) / (1 + 2 * z * w * dt), -1e5, 1e5); st.x += st.v * dt;
}

type Rail = {
  angle: number; c: number; s: number; near: number; gp: number; size: number; mid: number; f: number;
  from: number; rhoEnd: number; zEnd: number; exit: number; reach: number; tubeLen: number; leaves: Quat; freeAt: number; life: number;
};
type Card = {
  n: number; layer: number; born: number; rail: Rail; phase: number; air: number[]; spin: number; rate: number;
  off: { x: Spring; y: Spring }; felt: [number, number]; thrown: number; curl: number; tilt: { x: Spring; y: Spring; z: Spring };
};
type Spot = { r: number; z: number; s: number; toward: number; m: number };
type Air = { q: Quat; press: number; rush: number; slip: [number, number] };
type Pose = { c: Card; p: Spot; x: number; y: number; air?: Air };

export type Flow = {
  ready: Promise<void>; readonly webgl: boolean;
  setPaused(p: boolean): void; setStill(s: boolean): void; destroy(): void;
};

export function createBurnFlow(stage: HTMLElement, canvas: HTMLCanvasElement, options: Partial<FlowOptions>): Flow {
  const o: FlowOptions = { ...DEFAULTS, ...options };
  const hoverQ = matchMedia("(hover: hover) and (pointer: fine)");
  let W = 1, H = 1, dpr = 1, phone = false;
  const frame = () => { const short = Math.min(W, H); return { short, R: clamp(K.ringR * short, K.ringRMin, K.ringRMax), a: clamp(K.tube * short, K.tubeMin, K.tubeMax) }; };

  // ---- where each card travels ----
  function rail(n: number): Rail {
    const r = seeded(Math.imul(n + 1, 2654435761)), { short, R, a } = frame();
    const angle = n * GOLDEN + (r() * 2 - 1) * 0.1, near = mix(K.near[0], K.near[1], r());
    const gp = clamp(short / 900, K.cardMin, K.cardMax), size = K.card * gp, half = size / 2;
    const mid = R / DEPTH, f = a / DEPTH, from = -half - 0.1 * f, off = f * (Math.PI - LET_GO) + half;
    const end = tubePoint(off, mid, f), zEnd = EYE - EYE / DEPTH - f + end.z;
    const c = Math.cos(angle), s = Math.sin(angle);
    const toEdge = Math.min(W / 2 / Math.max(1e-9, Math.abs(c)), H / 2 / Math.max(1e-9, Math.abs(s)));
    const exit = toEdge + size * near * 0.8, reach = Math.hypot(W, H) / 2 + size * K.near[1] * 0.8;
    const tubeLen = DEPTH * (off - from);
    // at release: X runs across the card, Y is its up (outward and tipped back), Z its face
    const X: Vec3 = [Math.sin(angle), -Math.cos(angle), 0];
    const Y: Vec3 = [c * Math.sin(LET_GO), s * Math.sin(LET_GO), -Math.cos(LET_GO)];
    const Z: Vec3 = [c * Math.cos(LET_GO), s * Math.cos(LET_GO), Math.sin(LET_GO)];
    return { angle, c, s, near, gp, size, mid, f, from, rhoEnd: end.rho, zEnd, exit, reach, tubeLen, leaves: qframe(X, Y, Z),
      freeAt: rampInv(10 * coastInv(tubeLen / reach)), life: rampInv(10 * coastInv((tubeLen + exit - end.rho * scaleAt(zEnd)) / reach)) };
  }
  function spot(rl: Rail, t: number): Spot {
    const n = rl.reach * coast(ramp(clamp(t, 0, rl.life)) / 10), s = rl.from + n / DEPTH;
    if (t < rl.freeAt) { const p = tubePoint(s, rl.mid, rl.f), z = EYE - EYE / DEPTH - rl.f + p.z; return { r: p.rho * scaleAt(z), z, s, toward: 0, m: scaleAt(z) }; }
    const u = clamp((n - rl.tubeLen) / (rl.exit - rl.rhoEnd * scaleAt(rl.zEnd)), 0, 1);
    const rho1 = rl.exit / rl.near, z1 = EYE - EYE / rl.near, L = Math.hypot(rho1 - rl.rhoEnd, z1 - rl.zEnd);
    const rho = hermite(rl.rhoEnd, Math.sin(LET_GO) * L, rho1, rho1 - rl.rhoEnd, u), z = hermite(rl.zEnd, -Math.cos(LET_GO) * L, z1, z1 - rl.zEnd, u);
    return { r: rho * scaleAt(z), z, s, toward: smooth(rl.freeAt, rl.freeAt + K.release, t), m: scaleAt(z) };
  }

  // ---- births ----
  let cards: Card[] = [], born = 0, sceneT = 0, wallT = 0, nextAt = K.firstAt, interval = 1, aspects: number[] = [], layers = 1;
  const count = () => (phone ? o.phoneCount : o.count);
  const meanLife = () => { let t = 0; for (let i = 0; i < 64; i++) t += rail(i).life; return t / 64; };
  function spawn(at: number) {
    const n = born++, r = seeded(Math.imul(n + 1, 3266489909) ^ K.seed);
    cards.push({ n, layer: n % layers, born: at, rail: rail(n), phase: r() * Math.PI * 2,
      air: Array.from({ length: 8 }, () => r() * Math.PI * 2), spin: r() < 0.5 ? -1 : 1, rate: 0.6 + r() * 0.8,
      off: { x: { x: 0, v: 0 }, y: { x: 0, v: 0 } }, felt: [0, 0], thrown: 0, curl: Math.PI / 2,
      tilt: { x: { x: 0, v: 0 }, y: { x: 0, v: 0 }, z: { x: 0, v: 0 } } });
  }
  function reset() { cards = []; born = 0; sceneT = 0; wallT = 0; nextAt = K.firstAt; interval = meanLife() / count(); }
  function advance(dt: number, still: boolean) {
    // the scene clock runs fast at first so the stage fills quickly, then settles to real time
    const rush = still ? 1 : 1 + (K.rushTimes - 1) * (1 - smooth(0, K.rushOver, wallT + dt / 2));
    sceneT += dt * rush; wallT += dt;
    while (sceneT >= nextAt) { spawn(nextAt); nextAt += nextAt < K.burstUntil ? interval / K.burstTimes : interval; }
    cards = cards.filter((c) => sceneT - c.born < c.rail.life);
    for (let left = dt; left > 1e-9; left -= 1 / 120) respond(Math.min(1 / 120, left));
  }

  // ---- the free flight: a cheap stand-in for paper in air ----
  function airborne(c: Card, tf: number): Air {
    const a = c.air, k = c.rate;
    const press = 0.24 * Math.sin(0.9 * k * tf + a[0]) + 0.12 * Math.sin(2.1 * k * tf + a[1]);
    const rush = 0.5 + 0.5 * Math.sin(1.3 * k * tf + a[2]);
    const settle = smooth(0, 2.2, tf);
    const q1 = qaxis(1, 0, 0, (Math.PI / 2 - LET_GO) * 0.8 * settle + 0.42 * Math.sin(0.5 * k * tf + a[3]) * settle);
    const q2 = qaxis(0, 1, 0, 0.45 * Math.sin(0.42 * k * tf + a[4]) * settle);
    const q3 = qaxis(0, 0, 1, c.spin * 0.16 * tf + 0.25 * Math.sin(0.7 * k * tf + a[5]));
    return { q: qmul(qmul(q3, q1), q2), press, rush, slip: [26 * Math.sin(0.6 * k * tf + a[6]) * settle, 18 * Math.sin(0.45 * k * tf + a[7]) * settle] };
  }

  // ---- the pointer ----
  const ptr = { x: 0, y: 0, vx: 0, vy: 0, active: false, t: 0 };
  const sw = (2 * Math.PI) / K.springPeriod, tw = (2 * Math.PI) / 1.5;
  let still = false;
  function pose(c: Card): Pose {
    const rl = c.rail, tc = sceneT - c.born, p = spot(rl, tc);
    const out: Pose = { c, p, x: p.r * rl.c + c.off.x.x, y: p.r * rl.s + c.off.y.x };
    if (p.toward > 0) { const air = airborne(c, tc - rl.freeAt); out.air = air; out.x += air.slip[0] * rl.gp * p.m; out.y += air.slip[1] * rl.gp * p.m; }
    return out;
  }
  function respond(dt: number) {
    const { short, R, a } = frame(), radius = Math.max(K.fieldMin, K.field * short), ringOut = R + a;
    const on = ptr.active && !still;
    const soft = (x: number) => 0.6 * Math.tanh(x / 0.6);
    for (const c of cards) {
      const ps = pose(c), dx = W / 2 + ps.x - ptr.x, dy = H / 2 + ps.y - ptr.y, d = Math.hypot(dx, dy);
      let fx = 0, fy = 0;
      if (on && d < radius) {
        const fall = (1 - (d / radius) ** 2) ** 2, sp = Math.hypot(ptr.vx, ptr.vy), cap = Math.min(sp, K.speedCap);
        const ux = d > 1e-3 ? dx / d : sp > 0 ? ptr.vx / sp : 0, uy = d > 1e-3 ? dy / d : sp > 0 ? ptr.vy / sp : 0, k = sp > 0 ? (cap / sp) * K.along : 0;
        fx = fall * (ux * (K.push + K.pushGain * cap) + ptr.vx * k); fy = fall * (uy * (K.push + K.pushGain * cap) + ptr.vy * k);
      }
      // cards still near the ring barely move; once out in the open they answer fully
      const wgt = 0.08 + 0.92 * smooth(0.35 * ringOut, 1.45 * ringOut, Math.hypot(ps.x - c.off.x.x, ps.y - c.off.y.x));
      const e = 1 - Math.exp(-dt * K.felt);
      c.felt[0] += (fx * wgt - c.felt[0]) * e; c.felt[1] += (fy * wgt - c.felt[1]) * e;
      springStep(c.off.x, c.felt[0], dt, sw, K.springZeta); springStep(c.off.y, c.felt[1], dt, sw, K.springZeta);
      const g = Math.hypot(c.off.x.v, c.off.y.v), hard = Math.hypot(g, 0.6 * sw * Math.hypot(c.off.x.x, c.off.y.x));
      const free = smooth(0, 0.6, sceneT - c.born - c.rail.freeAt), want = smooth(0, K.throwAt, hard) * free;
      c.thrown += (want - c.thrown) * (1 - Math.exp(-dt * (want > c.thrown ? 6 : 2.5)));
      if (g > 70) { const aim = Math.atan2(c.off.y.v, c.off.x.v) - (Math.PI / 2 - c.rail.angle); c.curl += Math.atan(Math.tan(aim - c.curl)) * (1 - Math.exp(-dt * K.curlRate)); }
      const cross = (ps.x + W / 2 - ptr.x) * ptr.vy - (ps.y + H / 2 - ptr.y) * ptr.vx;
      springStep(c.tilt.x, tw * tw * free * soft(-(c.off.y.v * 0.003 + c.off.y.x * 8e-4)), dt, tw, 0.45);
      springStep(c.tilt.y, tw * tw * free * soft(c.off.x.v * 0.003 + c.off.x.x * 8e-4), dt, tw, 0.45);
      springStep(c.tilt.z, tw * tw * free * soft(on && d < radius ? cross * 9e-6 : 0), dt, tw, 0.45);
    }
  }

  // ---- WebGL 2 ----
  let gl: WebGL2RenderingContext | null = null, G: Gpu | null = null;
  if (!o.noWebGL) { try { gl = canvas.getContext("webgl2", { alpha: false, antialias: false, premultipliedAlpha: false }); } catch { gl = null; } }
  if (gl) { try { G = buildGpu(gl); } catch { gl = null; G = null; } }
  const onLost = (e: Event) => { e.preventDefault(); gl = null; G = null; stage.dataset.gl = "off"; drawStill(); };
  canvas.addEventListener("webglcontextlost", onLost);
  stage.dataset.gl = gl ? "on" : "off";

  async function upload() {
    const list = o.pictures.length ? o.pictures : [blank()];
    layers = list.length; aspects = list.map(() => o.aspect);
    if (!gl || !G) return;
    const [tw2, th2] = o.texture, c = document.createElement("canvas"); c.width = tw2; c.height = th2;
    const x = c.getContext("2d")!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, G.pics);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, tw2, th2, layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    list.forEach((img, i) => {
      const iw = (img as HTMLImageElement).naturalWidth || img.width, ih = (img as HTMLImageElement).naturalHeight || img.height, s = Math.max(tw2 / iw, th2 / ih);
      x.clearRect(0, 0, tw2, th2); x.drawImage(img, (tw2 - iw * s) / 2, (th2 - ih * s) / 2, iw * s, ih * s);
      gl!.texSubImage3D(gl!.TEXTURE_2D_ARRAY, 0, 0, 0, i, tw2, th2, 1, gl!.RGBA, gl!.UNSIGNED_BYTE, c);
    });
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  }
  function blank() { const c = document.createElement("canvas"); c.width = 72; c.height = 105; const x = c.getContext("2d")!; x.fillStyle = "#0e1428"; x.fillRect(0, 0, 72, 105); return c; }
  const pictures = () => (o.pictures.length ? o.pictures : [blank()]);

  const PER = 24;                     // floats per card instance
  let inst = new Float32Array(32 * PER);
  function draw(appear: number) {
    if (!gl || !G) return;
    const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    if (G.tw !== cw || G.th !== ch) { gl.bindTexture(gl.TEXTURE_2D, G.target); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cw, ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); G.tw = cw; G.th = ch; }
    // 1. cards, far to near, into an offscreen target
    const poses = cards.map(pose).sort((a, b) => a.p.z - b.p.z);
    if (inst.length < poses.length * PER) inst = new Float32Array(poses.length * PER * 2);
    poses.forEach((ps, i) => {
      const c = ps.c, rl = c.rail, p = ps.p, m = p.m;
      let q = rl.leaves, bend = 0, flutter = 0;
      if (ps.air) { q = qmul(rl.leaves, ps.air.q); bend = K.throwBend * ps.air.press * (1 - c.thrown) + K.throwBend * c.thrown; flutter = 0.045 * ps.air.rush + 0.05 * c.thrown; }
      q = qmul(qrot([c.tilt.x.x, c.tilt.y.x, c.tilt.z.x]), q);
      const asp = aspects[c.layer] || o.aspect, dims = asp >= 1 ? [1, 1 / asp] : [asp, 1];
      inst.set([ps.x / m, ps.y / m, EYE - EYE / m, ...q, dims[0], dims[1], rl.size, c.layer, bend, c.curl, flutter, c.phase + sceneT * 9,
        p.toward, p.s, rl.angle, 0, c.off.x.x / m, c.off.y.x / m, 0, 0], i * PER);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, G.fbo); gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(G.card.prog); gl.bindVertexArray(G.cardVao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, G.pics);
    const U = G.card.u, { R, a } = frame();
    gl.uniform1i(U.uPics, 0); gl.uniform2f(U.uView, W, H); gl.uniform4f(U.uRing, R / DEPTH, a / DEPTH, EYE - EYE / DEPTH, LET_GO);
    gl.bindBuffer(gl.ARRAY_BUFFER, G.instBuf); gl.bufferData(gl.ARRAY_BUFFER, inst.subarray(0, poses.length * PER), gl.DYNAMIC_DRAW);
    gl.drawElementsInstanced(gl.TRIANGLES, G.indexCount, gl.UNSIGNED_SHORT, 0, poses.length);
    gl.bindVertexArray(null); gl.disable(gl.BLEND);
    // 2. onto the ground, with light in the hole and a dither
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cw, ch);
    gl.useProgram(G.comp.prog); gl.bindVertexArray(G.fullVao);
    const C = G.comp.u;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.target); gl.uniform1i(C.uCards, 0);
    gl.uniform2f(C.uSize, W, H); gl.uniform1f(C.uDpr, dpr); gl.uniform2f(C.uRing, R, a); gl.uniform1f(C.uAppear, appear);
    gl.uniform3f(C.uGround, ...hex(o.ground));
    gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
  }

  // ---- the still: the flow run forward, then drawn once ----
  function warm() { reset(); const keep = ptr.active; ptr.active = false; for (let t = 0; t < K.warm; t += 0.1) advance(0.1, true); ptr.active = keep; }
  function drawStill() {
    warm();
    if (gl) { draw(1); return; }
    const x = canvas.getContext("2d"); if (!x) return;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = o.ground; x.fillRect(0, 0, W, H);
    const pics = pictures();
    for (const ps of cards.map(pose).sort((a, b) => a.p.z - b.p.z)) {
      if (ps.p.toward < 0.5 && ps.p.s < ps.c.rail.f * Math.PI * 0.5) continue;   // still inside the ring: hidden
      const c = ps.c, rl = c.rail, img = pics[c.layer]; if (!img) continue;
      const q = ps.air ? qmul(rl.leaves, ps.air.q) : rl.leaves, m = ps.p.m, s = rl.size, asp = aspects[c.layer] || o.aspect;
      const cx = ps.x / m, cy = ps.y / m, cz = EYE - EYE / m, hw = (s * Math.min(asp, 1)) / 2, hh = (s * Math.min(1 / asp, 1)) / 2;
      const proj = (lx: number, ly: number) => { const w = turn(q, [lx, ly, 0]), k = EYE / (EYE - (cz + w[2])); return [W / 2 + (cx + w[0]) * k, H / 2 + (cy + w[1]) * k]; };
      const tl = proj(-hw, hh), tr = proj(hw, hh), bl = proj(-hw, -hh);
      const iw = (img as HTMLImageElement).naturalWidth || img.width, ih = (img as HTMLImageElement).naturalHeight || img.height;
      const sc = Math.max(o.texture[0] / iw, o.texture[1] / ih), sw2 = o.texture[0] / sc, sh2 = o.texture[1] / sc;
      x.save(); x.setTransform(dpr * (tr[0] - tl[0]) / sw2, dpr * (tr[1] - tl[1]) / sw2, dpr * (bl[0] - tl[0]) / sh2, dpr * (bl[1] - tl[1]) / sh2, dpr * tl[0], dpr * tl[1]);
      x.drawImage(img, (iw - sw2) / 2, (ih - sh2) / 2, sw2, sh2, 0, 0, sw2, sh2); x.restore();
    }
  }

  // ---- loop, input, lifecycle ----
  let raf = 0, last = 0, onScreen = true, paused = false, dead = false, started = 0, ready = false;
  const running = () => !dead && ready && !!gl && !still && !paused && onScreen && !document.hidden;
  function kick() { if (!raf && running()) { last = 0; raf = requestAnimationFrame(tick); } }
  function tick(now: number) {
    raf = 0; if (!running()) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60; last = now;
    if (now - ptr.t > 80) { ptr.vx *= Math.exp(-dt * 12); ptr.vy *= Math.exp(-dt * 12); }
    advance(dt, false);
    draw(smooth(0, K.appearIn, (now - started) / 1000));
    raf = requestAnimationFrame(tick);
  }
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || !hoverQ.matches) return;
    const r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, now = performance.now();
    const dt = Math.max(8, now - (ptr.t || now - 16)) / 1000;
    if (ptr.active) { ptr.vx = ptr.vx * 0.4 + ((x - ptr.x) / dt) * 0.6; ptr.vy = ptr.vy * 0.4 + ((y - ptr.y) / dt) * 0.6; }
    ptr.x = x; ptr.y = y; ptr.t = now; ptr.active = x >= 0 && y >= 0 && x <= W && y <= H;
  };
  const onLeave = () => { ptr.active = false; ptr.vx = ptr.vy = 0; };
  addEventListener("pointermove", onMove, { passive: true });
  stage.addEventListener("pointerleave", onLeave);
  function measure() {
    const nw = stage.clientWidth, nh = stage.clientHeight; if (!nw || !nh) return false;
    const changed = nw !== W || nh !== H; W = nw; H = nh; phone = W < o.phoneWidth;
    dpr = Math.min(devicePixelRatio || 1, phone ? K.phoneMaxDpr : K.maxDpr);
    if (changed) {
      interval = meanLife() / count();
      // keep every card at the same fraction of its trip on its new rail
      for (const c of cards) {
        const t = sceneT - c.born, old = c.rail; c.rail = rail(c.n);
        const k = t < old.freeAt ? (t / old.freeAt) * c.rail.freeAt : c.rail.freeAt + ((t - old.freeAt) / (old.life - old.freeAt)) * (c.rail.life - c.rail.freeAt);
        c.born = sceneT - k;
      }
    }
    return changed;
  }
  let rt = 0;
  const ro = new ResizeObserver(() => { clearTimeout(rt); rt = window.setTimeout(() => { if (measure() && ready && (still || !gl)) drawStill(); else if (ready && paused && gl) draw(1); }, 120); });
  ro.observe(stage);
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; kick(); }, { rootMargin: "80px" });
  io.observe(stage);
  const onVis = () => kick();
  document.addEventListener("visibilitychange", onVis);

  const whenReady = (async () => {
    measure(); await upload(); if (dead) return; measure(); reset(); ready = true; stage.dataset.ready = "";
    if (still || !gl) drawStill(); else { started = performance.now(); if (paused) { warm(); draw(1); } kick(); }
  })();

  return {
    ready: whenReady, get webgl() { return !!gl; },
    setPaused(p) {
      if (p === paused) return; paused = p;
      if (p) { cancelAnimationFrame(raf); raf = 0; } else kick();
    },
    setStill(s) {
      if (s === still) return; still = s;
      if (!ready) return;
      if (s) { cancelAnimationFrame(raf); raf = 0; drawStill(); } else { reset(); started = performance.now(); kick(); }
    },
    destroy() {
      dead = true; cancelAnimationFrame(raf); clearTimeout(rt); ro.disconnect(); io.disconnect();
      document.removeEventListener("visibilitychange", onVis); removeEventListener("pointermove", onMove); stage.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

function hex(h: string): [number, number, number] {
  const s = h.replace("#", "");
  const f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255) as [number, number, number];
}

// ---- GPU programs and buffers ----
type Prog = { prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };
type Gpu = {
  card: Prog; comp: Prog; cardVao: WebGLVertexArrayObject; fullVao: WebGLVertexArrayObject; instBuf: WebGLBuffer;
  indexCount: number; pics: WebGLTexture; target: WebGLTexture; fbo: WebGLFramebuffer; tw: number; th: number;
};
function buildGpu(gl: WebGL2RenderingContext): Gpu {
  const compile = (vs: string, fs: string): Prog => {
    const sh = (t: number, s: string) => { const x = gl.createShader(t)!; gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x) ?? "shader"); return x; };
    const prog = gl.createProgram()!; gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
    const u: Prog["u"] = {}; const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(prog, i)!; u[a.name] = gl.getUniformLocation(prog, a.name); }
    return { prog, u };
  };
  const card = compile(CARD_VS, CARD_FS), comp = compile(FULL_VS, COMP_FS);
  // each card is a 20 x 28 mesh so it can bend and wrap
  const nx = 20, ny = 28, verts: number[] = [], idx: number[] = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) verts.push(i / nx - 0.5, j / ny - 0.5);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
  const cardVao = gl.createVertexArray()!; gl.bindVertexArray(cardVao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(card.prog, "aPos"); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  const instBuf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  const fields: [string, number, number][] = [["iC", 3, 0], ["iQ", 4, 3], ["iShape", 4, 7], ["iPaper", 4, 11], ["iTube", 4, 15], ["iPush", 4, 19]];
  for (const [name, size, off] of fields) { const l = gl.getAttribLocation(card.prog, name); if (l < 0) continue; gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 24 * 4, off * 4); gl.vertexAttribDivisor(l, 1); }
  gl.bindVertexArray(null);
  const fullVao = gl.createVertexArray()!; gl.bindVertexArray(fullVao);
  const fb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, fb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const fp = gl.getAttribLocation(comp.prog, "aPos"); gl.enableVertexAttribArray(fp); gl.vertexAttribPointer(fp, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const pics = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D_ARRAY, pics);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const aniso = gl.getExtension("EXT_texture_filter_anisotropic"); if (aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
  const target = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, target);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fbo = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { card, comp, cardVao, fullVao, instBuf, indexCount: idx.length, pics, target, fbo, tw: 0, th: 0 };
}

// A card: on the tube (each vertex placed by its own arc length along the ring's profile) or free (bent across its
// curl axis, swaying half a wave along it, turned by its quaternion), blended by "toward".
const CARD_VS = `#version 300 es
in vec2 aPos; in vec3 iC; in vec4 iQ; in vec4 iShape; in vec4 iPaper; in vec4 iTube; in vec4 iPush;
uniform vec2 uView; uniform vec4 uRing;      // middle radius, tube radius, crest depth, release angle (world units)
out vec2 vUv; out vec3 vN; out float vShown; flat out float vLayer;
const float EYE = ${EYE.toFixed(1)};
vec3 rotateBy(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
void main() {
  vUv = vec2(aPos.x + 0.5, 0.5 - aPos.y); vLayer = iShape.w;
  vec2 dims = iShape.xy; float size = iShape.z; vec2 dr = aPos * dims;
  float bend = iPaper.x, c = cos(iPaper.y), s = sin(iPaper.y), flutter = iPaper.z;
  float across = dr.x * c + dr.y * s, along = -dr.x * s + dr.y * c, bent = across, z = 0.0, tilt = 0.0;
  if (abs(bend) > 1e-4) { float r = dims.x / bend; tilt = across / r; bent = r * sin(tilt); z = r * (1.0 - cos(tilt)); }
  float k = 3.14159265 / max(dims.x, dims.y), wave = along * k + iPaper.w;
  z += flutter * sin(wave);
  vec3 lie = normalize(vec3(-sin(tilt), -flutter * k * cos(wave), cos(tilt)));
  vec3 world = iC + rotateBy(iQ, vec3(bent * c - along * s, bent * s + along * c, z) * size);
  vec3 normal = rotateBy(iQ, vec3(lie.x * c - lie.y * s, lie.x * s + lie.y * c, lie.z));
  float shown = 1.0, toward = iTube.x;
  if (toward < 1.0) {
    vec2 hd = vec2(cos(iTube.z), sin(iTube.z)), side = vec2(sin(iTube.z), -cos(iTube.z));
    float at = iTube.y + dr.y * size, f = uRing.y, arc = f * (3.14159265 - uRing.w);
    float rho = uRing.x - f, h = at; vec2 goes = vec2(0.0, 1.0);
    if (at >= 0.0) { float t = 3.14159265 - min(at, arc) / f, past = max(0.0, at - arc); goes = vec2(sin(t), -cos(t));
      rho = uRing.x + f * cos(t) + past * goes.x; h = f * sin(t) + past * goes.y; }
    vec3 tube = vec3(hd * rho + side * dr.x * size + iPush.xy, uRing.z - f + h);
    world = mix(tube, world, toward);
    normal = mix(vec3(hd * -goes.y, goes.x), normal, toward);
    shown = mix(smoothstep(0.0, 0.42 * f * 1.5707963, at), 1.0, toward);   // inside the hole nothing shows
  }
  vN = normal; vShown = shown;
  gl_Position = vec4(world.x * EYE / (uView.x * 0.5), -world.y * EYE / (uView.y * 0.5), 0.0, EYE - world.z);
}`;
const CARD_FS = `#version 300 es
precision highp float; precision highp sampler2DArray;
in vec2 vUv; in vec3 vN; in float vShown; flat in float vLayer;
uniform sampler2DArray uPics;
out vec4 outColor;
void main() {
  if (vShown < 0.003) discard;
  vec2 uv = vUv; vec3 n = normalize(vN);
  // the picture reads the right way round from either side of the sheet
  if (n.z < 0.0) n = -n; else uv.x = 1.0 - uv.x;
  vec3 col = texture(uPics, vec3(uv, vLayer)).rgb;
  vec2 px = max(fwidth(vUv), vec2(1e-6)), e = min(vUv, 1.0 - vUv) / px;
  float aa = clamp(min(e.x, e.y) + 0.5, 0.0, 1.0);
  col *= mix(0.8, 1.0, n.z);                      // a sheet turned away from the eye darkens a little
  outColor = vec4(col, 1.0) * aa * vShown;
}`;
const FULL_VS = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
const COMP_FS = `#version 300 es
precision highp float;
uniform sampler2D uCards; uniform vec2 uSize, uRing; uniform float uDpr, uAppear; uniform vec3 uGround;
out vec4 outColor;
void main() {
  vec2 p = vec2(gl_FragCoord.x, uDpr * uSize.y - gl_FragCoord.y) / uDpr, uv = p / uSize;
  vec4 c = texture(uCards, vec2(uv.x, 1.0 - uv.y));
  float d = length(p - uSize * 0.5);
  float light = uAppear * exp(-pow(d / max(0.8 * (uRing.x - uRing.y), 1.0), 2.0));
  vec3 colour = uGround * (1.0 - c.a) + mix(c.rgb, vec3(c.a), light);
  float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy + 17.0, vec2(0.06711056, 0.00583715))));
  outColor = vec4(colour + (grain - 0.5) / 255.0, 1.0);
}`;
