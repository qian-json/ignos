// Written with AI assistance (Claude Code)
// A flame on a rod, drawn as a few tens of thousands of points (an illustration, not data).
// The fan setting moves it: with strong air the grains stream away from the rod and the flame
// stretches downstream; as the air dies away they slow, the flame shrinks to a small round glow,
// and the grains hang almost still. The pointer is a second fan: moving it pushes the grains,
// which spring back. Every motion is computed in the vertex shader from the point's index, so a
// frame costs one draw call and no uploads.
import * as THREE from "three";
import { webgl2Available } from "../three/webgl";

/** Points by rough device class: a power of two, so a prefix is an even subset. */
const COUNTS = { low: 1 << 15, high: 1 << 16 } as const;
const WAKE = 16;

/** WebGL 2 is here (the probe's context is released at once). */
export const hasWebGL2 = webgl2Available;

function deviceCount(): number {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency || 4;
  return coarse && (mem < 6 || cores < 6) ? COUNTS.low : COUNTS.high;
}

const VERT = /* glsl */ `
precision highp float; precision highp int;
uniform float uAdv, uTime, uFlow, uAspect, uPR, uSize, uMinPx, uScale;
uniform vec4 uWake[${WAKE}]; uniform float uWakeT[${WAKE}]; uniform float uWakeR, uSpringW, uSpringZ, uLife;
out float vAmt; out float vHot;
uint hsh(uint x){ x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float h01(uint x){ return float(hsh(x)) / 4294967295.; }
vec2 curl(vec2 p, float t){ return vec2(sin(p.y * 7.1 + t * 2.3) + sin(p.y * 13.7 - t * 3.1 + p.x * 5.), cos(p.x * 6.3 - t * 1.9) + sin(p.x * 11.3 + t * 2.7)) * .5; }
void main(){
  int id = gl_VertexID; uint u = uint(id);
  float r1 = h01(u * 5u + 1u), r2 = h01(u * 5u + 2u), r3 = h01(u * 5u + 3u), r4 = h01(u * 5u + 4u), r5 = h01(u * 5u + 5u);
  float f = uFlow;                                   // 0 = fans almost off, 1 = full fans
  const float ROD_R = .055, LEAD = -.62;             // rod radius; where the flame's leading edge sits
  vec2 p; float amt; float hot = 0.;
  {
    // a grain's life runs from the leading edge (s = 0) to the tail (s = 1)
    float speed = .55 + .9 * r2;
    float s = fract(r1 + uAdv * speed);
    float len = mix(.34, 1.62, pow(f, .8));          // the flame stretches downstream with the air
    float wid = mix(.2, .15, f);                     // still air: rounder; strong air: thinner
    float env = wid * pow(s, .38) * pow(1. - s, 1.05) * 2.6;  // round at the leading edge, tapering downstream
    float th = r3 * 6.2831853;
    bool inner = r4 < .22;                           // a few grains fill the inside; the rest are the sheet
    float sheet = inner ? r4 / .22 * .85 : 1. + (r4 - .6) * .06;
    float x = LEAD + s * len;
    float y = (ROD_R + env * sheet) * cos(th);
    p = vec2(x, y);
    // turbulence grows with the air; at the lowest setting the flame hangs almost still
    p += curl(p * 1.3 + r2, uTime) * (.004 + .03 * f * f) * s;
    p.x += (.012 + .02 * f) * sin(uTime * (1.5 + 3. * f) + r4 * 6.28) * s;
    float facing = .5 + .5 * sin(th);                // the near side reads brighter
    hot = smoothstep(.22, 0., s) * (.6 + .4 * facing);       // the bright base by the leading edge
    float birth = smoothstep(0., .06, s), death = 1. - smoothstep(.7, 1., s);
    amt = birth * death * (.35 + .65 * facing) * mix(.5, 1., f) * (inner ? .3 : 1.);   // dimmer in still air
  }
  p *= uScale;
  vec2 sp = vec2(p.x / uAspect, p.y);
  // the pointer's wake: each slot pushes, then springs back (damped sine), gone by uLife
  vec2 push = vec2(0.); float wd = uSpringW * sqrt(1. - uSpringZ * uSpringZ);
  {
    vec2 asp = vec2(uAspect, 1.);
    for (int k = 0; k < ${WAKE}; k++) {
      float age = uTime - uWakeT[k]; if (age < 0. || age > uLife) continue;
      vec2 d = (sp - uWake[k].xy) * asp; float fw = exp(-dot(d, d) / (uWakeR * uWakeR)); if (fw < .002) continue;
      float resp = exp(-uSpringZ * uSpringW * age) * sin(wd * age) * (1. - smoothstep(.7 * uLife, uLife, age));
      vec2 w = uWake[k].zw;
      push += (w + vec2(-w.y, w.x) * (r2 - .5) * 1.3 + normalize(d + 1e-5) * length(w) * .6) * fw * resp * (.45 + 1.1 * r1);
    }
    push /= asp;
  }
  gl_Position = vec4(sp + push + vec2(0., 0.), 0., 1.);
  float sz = uSize * uPR * (.6 + .9 * r3);
  float fade = min(1., sz / uMinPx);
  vAmt = amt * fade * fade; vHot = hot;
  gl_PointSize = max(sz, uMinPx);
}`;

const FRAG = /* glsl */ `
precision highp float;
in float vAmt; in float vHot;
uniform vec3 uInk, uHotInk; uniform float uStrength;
out vec4 outColor;
void main(){
  vec2 q = gl_PointCoord * 2. - 1.; float a = 1. - smoothstep(.3, 1., length(q));
  vec3 ink = mix(uInk, uHotInk, vHot);
  float k = clamp(vAmt * a * uStrength, 0., 1.);
  outColor = vec4(ink * k, k);
}`;

function cssColour(str: string): [number, number, number] {
  const c = document.createElement("canvas"); c.width = c.height = 1;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#000"; g.fillStyle = str.trim() || "#000"; g.fillRect(0, 0, 1, 1);
  const d = g.getImageData(0, 0, 1, 1).data;
  // the shader works in linear light; tokens are sRGB
  const lin = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return [lin(d[0]), lin(d[1]), lin(d[2])];
}

export interface FlameField {
  setFlow(f: number): void;
  destroy(): void;
}

export interface FlameOptions {
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  /** 0 = the lowest fan setting, 1 = the highest */
  flow: number;
  /** CSS custom properties read from the host for the inks */
  inks?: { ink: string; hot: string };
}

export function flameField(o: FlameOptions): FlameField | null {
  if (!hasWebGL2()) return null;
  const { host, canvas } = o;
  const html = document.documentElement;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" });
  } catch { return null; }
  renderer.setClearColor(0x000000, 0);
  const rmq = matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = rmq.matches;

  const N = deviceCount();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));   // sets the count only
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e3);
  const cs = getComputedStyle(host);
  const ink = (v: string, fb: string) => cssColour(cs.getPropertyValue(v) || fb);
  const keys = o.inks ?? { ink: "--flame", hot: "--flame-glow" };
  const U = {
    uAdv: { value: 0 }, uTime: { value: 0 }, uFlow: { value: o.flow },
    uAspect: { value: 1 }, uPR: { value: 1 }, uSize: { value: 1.5 }, uMinPx: { value: 1.2 }, uScale: { value: 0.9 },
    uWake: { value: new Float32Array(WAKE * 4) }, uWakeT: { value: new Float32Array(WAKE).fill(-99) },
    uWakeR: { value: 0.27 }, uSpringW: { value: 2 * Math.PI * 1.6 }, uSpringZ: { value: 0.5 }, uLife: { value: 1 },
    uInk: { value: new THREE.Vector3(...ink(keys.ink, "#2c50cf")) },
    uHotInk: { value: new THREE.Vector3(...ink(keys.hot, "#4a6cf2")) },
    uStrength: { value: 0.3 },
  };
  // premultiplied ink over the page's light ground
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, uniforms: U,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(pts);
  const cam = new THREE.Camera();

  let aspect = 1;
  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    aspect = w / h;
    const pr = Math.min(devicePixelRatio || 1, N === COUNTS.low ? 1.5 : 1.75);
    renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
    U.uAspect.value = aspect; U.uPR.value = pr;
    // the flame spans about 1.9 units at full air: fit it to the narrower side
    U.uScale.value = Math.min(0.92, 0.92 * aspect / 1.15);
    const sc = U.uScale.value;
    host.style.setProperty("--rod-half", `${((1.25 * sc) / aspect) * 50}%`);   // half the rod's length, as a share of the width
    host.style.setProperty("--rod-thick", `${Math.max(4, 0.055 * sc * h)}px`); // its diameter on screen
    host.style.setProperty("--rod-lead", `${50 + ((-0.62 * sc) / aspect) * 50}%`); // the flame's leading edge
    dirty = true;
  }

  // ---- the pointer is a fan: each move lays a wake slot that pushes, then springs back
  const ptr = { ax: 0, ay: 0, last: 0, px: null as number | null, py: null as number | null };
  let wakeI = 0, clock = 0;
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) { ptr.px = null; return; }
    const x = ((e.clientX - r.left) / r.width) * 2 - 1, y = 1 - ((e.clientY - r.top) / r.height) * 2;
    if (ptr.px !== null && ptr.py !== null) { ptr.ax += x - ptr.px; ptr.ay += y - ptr.py; }
    ptr.px = x; ptr.py = y;
    if (!running()) return;
    const now = performance.now(), len = Math.hypot(ptr.ax * aspect, ptr.ay);
    if (now - ptr.last >= 50 && len > 0.004) {
      const g = Math.min(1, 0.3 / len) * 2.2;
      U.uWake.value.set([x, y, ptr.ax * g, ptr.ay * g], 4 * wakeI); U.uWakeT.value[wakeI] = clock; wakeI = (wakeI + 1) % WAKE;
      ptr.ax = ptr.ay = 0; ptr.last = now;
    }
  };
  const ac = new AbortController();
  const sig = { signal: ac.signal, passive: true } as AddEventListenerOptions;
  addEventListener("pointermove", onMove, sig);
  addEventListener("resize", resize, sig);
  rmq.addEventListener("change", () => { reduced = rmq.matches; update(); }, sig);

  // ---- stops: off screen, hidden tab, Pause all motion, reduced motion
  let onScreen = false, ready = true;
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; update(); }); io.observe(host);
  document.addEventListener("visibilitychange", () => update(), sig);
  const mo = new MutationObserver(() => update()); mo.observe(html, { attributes: true, attributeFilter: ["data-motion"] });
  const running = () => ready && onScreen && !document.hidden && !reduced && html.dataset.motion !== "paused";

  let flowTarget = o.flow, flowNow = o.flow, adv = 0.37, dirty = true, raf = 0, loopOn = false, last = performance.now();
  function draw(dt: number) {
    const live = running();
    flowNow = live ? flowNow + (flowTarget - flowNow) * (1 - Math.exp(-dt / 0.45)) : flowTarget;
    if (live) {
      clock += dt;
      // grains travel faster with more air; at the lowest setting they barely move
      adv += dt * (0.012 + 0.34 * flowNow ** 1.4);
    } else U.uWakeT.value.fill(-99);
    U.uFlow.value = flowNow; U.uAdv.value = adv; U.uTime.value = live ? clock : 0;
    renderer.render(scene, cam); dirty = false;
  }
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!running()) { loopOn = false; if (dirty) draw(0); return; }
    draw(dt);
    raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (loopOn) return;
    if (running()) { loopOn = true; last = performance.now(); raf = requestAnimationFrame(frame); }
    else requestAnimationFrame(() => draw(0));
  }
  function update() { if (!running()) { loopOn = false; cancelAnimationFrame(raf); dirty = true; requestAnimationFrame(() => draw(0)); } else kick(); }

  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); ready = false; host.classList.add("no-gl"); }, sig);
  canvas.addEventListener("webglcontextrestored", () => { ready = true; host.classList.remove("no-gl"); update(); }, sig);

  resize(); update();
  return {
    setFlow(f: number) { flowTarget = Math.max(0, Math.min(1, f)); dirty = true; if (!loopOn) update(); },
    destroy() { ac.abort(); io.disconnect(); mo.disconnect(); cancelAnimationFrame(raf); geo.dispose(); mat.dispose(); renderer.dispose(); renderer.forceContextLoss(); },
  };
}
