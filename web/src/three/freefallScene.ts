// Written with AI assistance (Claude Code)
// "Flame in freefall": two candles side by side (one burning on Earth, one in microgravity), or one
// candle whose flame morphs as gravity is switched on or off. An illustration, not data: the shapes
// and colours are qualitative, after the challenge text ("a flickering teardrop" becomes "a ghostly
// blue sphere"). Every constant below is a drawing choice in scene units, never a measurement.
import * as THREE from "three";

export type View = "compare" | "single";
export interface FreefallOptions { reducedMotion: boolean; night: string }

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
  float down(float lo, float hi, float x) { return 1.0 - smoothstep(lo, hi, x); }`;

const FLAME_VERT = /* glsl */ `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// One shape for both states: a circle round the wick that gravity stretches upward into a teardrop.
const FLAME_FRAG = /* glsl */ `
  uniform float uTime, uG, uFade, uSeed;
  varying vec2 vP;
  ${NOISE}
  void main() {
    float g = uG, t = uTime + uSeed * 17.0;
    vec2 p = vP;
    // on Earth the rising gas makes the flame sway and pump, more toward its tip
    float sway = (fbm(vec2(t * 0.9, p.y * 1.2 - t * 1.6)) - 0.5) * 0.3 * max(p.y - 0.15, 0.0) * g;
    float pump = 1.0 + 0.18 * g * (noise(vec2(t * 2.7, uSeed)) - 0.5);
    p.x -= sway;
    float R = mix(0.42, 0.27, g);
    vec2 c = vec2(0.0, mix(0.2, 0.32, g));
    float stretch = mix(1.0, 4.5 * pump, g);
    vec2 q = p - c;
    float qy = q.y > 0.0 ? q.y / stretch : q.y * mix(1.0, 1.25, g);
    float qx = q.x * (1.0 + 1.5 * g * clamp(qy / R, 0.0, 1.0));
    float h = clamp((p.y - c.y + R) / (R + R * stretch), 0.0, 1.0);
    float nd = length(vec2(qx, qy)) / R;
    nd += (fbm(vec2(p.x * 5.0, p.y * 3.0 - t * 3.0)) - 0.5) * mix(0.05, 0.32 * h, g);

    // Earth: yellow-white glow inside, orange at the edge, a dim core round the wick, blue at the
    // base and a dark, sooty tip
    vec3 orange = vec3(1.0, 0.42, 0.08), yellow = vec3(1.0, 0.78, 0.36), white = vec3(1.0, 0.95, 0.82);
    vec3 lum = mix(orange, yellow, down(0.45, 0.95, nd));
    lum = mix(lum, white, down(0.05, 0.55, nd) * smoothstep(0.12, 0.4, h) * down(0.45, 0.85, h));
    lum = mix(lum, vec3(0.4, 0.11, 0.03), smoothstep(0.62, 0.98, h));
    float core = down(0.0, 0.6, nd) * down(0.05, 0.42, h);
    float lumA = down(0.6, 1.0, nd) * smoothstep(0.06, 0.26, h) * (1.0 - 0.75 * core);
    float baseBlue = down(0.8, 1.05, nd) * smoothstep(0.35, 0.85, nd) * down(0.0, 0.34, h);
    vec3 earth = lum * lumA * 1.5 + vec3(0.22, 0.38, 1.0) * baseBlue * 0.9 + orange * down(0.95, 2.6, nd) * 0.1;

    // microgravity: a faint blue shell round the wick, slowly breathing
    float shell = exp(-pow((nd - 0.82) / 0.19, 2.0));
    vec3 deep = vec3(0.12, 0.24, 0.95);
    vec3 micro = (mix(deep, vec3(0.42, 0.6, 1.0), shell * 0.6) * (shell * 0.5 + down(0.1, 1.0, nd) * 0.26)
      + deep * down(0.9, 2.2, nd) * 0.09) * (0.93 + 0.07 * sin(t * 0.8));

    float e = smoothstep(0.0, 1.0, g);
    vec3 col = earth * e + micro * (1.0 - e);
    // Earth only: the rising plume above the tip, faint warm streaks and a thin wisp of smoke
    float tip = c.y + R * stretch;
    if (g > 0.01 && vP.y > tip - 0.3) {
      float up = max(vP.y - tip, 0.0);
      float w = 0.12 + 0.24 * up;
      float column = down(0.0, w, abs(vP.x - sway * 1.4)) * smoothstep(tip - 0.3, tip + 0.3, vP.y) * down(2.2, 3.3, vP.y);
      float streaks = smoothstep(0.5, 0.85, fbm(vec2(vP.x * 7.0, vP.y * 2.2 - t * 2.2)));
      float wisp = down(0.0, w * 0.45, abs(vP.x - sway * 1.6 - (fbm(vec2(vP.y * 1.5 - t * 1.2, t * 0.3)) - 0.5) * 0.4 * up));
      col += (vec3(1.0, 0.72, 0.5) * streaks * 0.05 + vec3(0.55, 0.5, 0.48) * wisp * 0.06) * column * g;
    }
    col *= uFade;
    gl_FragColor = vec4(1.0 - exp(-col * 1.25), 1.0);
  }`;

// Specks of hot gas carried up by the plume on Earth; in microgravity a few drift slowly outward.
const MOTE_VERT = /* glsl */ `
  uniform float uPhase, uG, uFade, uPx;
  attribute vec3 aSeed;
  varying float vA, vG;
  void main() {
    float life = fract(uPhase * (0.6 + aSeed.x * 0.8) + aSeed.y);
    vec3 rise = vec3((aSeed.z - 0.5) * (0.1 + life * 0.7) + sin(uPhase * 3.0 + aSeed.y * 6.28) * 0.05 * life, 1.3 + life * 2.0, (aSeed.x - 0.5) * 0.25);
    float a = aSeed.y * 6.2832, b = acos(aSeed.z * 2.0 - 1.0);
    vec3 drift = vec3(0.0, 0.2, 0.0) + vec3(sin(b) * cos(a), cos(b), sin(b) * sin(a)) * (0.5 + life * 0.7);
    vA = smoothstep(0.0, 0.2, life) * (1.0 - life) * uFade;
    vG = uG;
    vec4 mv = modelViewMatrix * vec4(mix(drift, rise, uG), 1.0);
    gl_PointSize = mix(0.035, 0.15 * (0.5 + life), uG) * uPx / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const MOTE_FRAG = /* glsl */ `
  varying float vA, vG;
  void main() {
    float a = (1.0 - smoothstep(0.0, 0.5, length(gl_PointCoord - 0.5))) * vA;
    gl_FragColor = vec4(mix(vec3(0.09, 0.12, 0.25), vec3(0.12, 0.08, 0.05), vG) * a, 1.0);
  }`;
// Light from the flame showing through the top of the wax.
const WAX_VERT = /* glsl */ `
  varying float vY, vF;
  void main() {
    vY = position.y;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vF = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }`;
const WAX_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uAmount, uTop;
  varying float vY, vF;
  void main() { gl_FragColor = vec4(uColor * pow(smoothstep(-uTop, uTop, vY), 2.5) * (0.3 + 0.7 * vF) * uAmount, 1.0); }`;

const R = 0.33;   // candle radius (scene units)
const H = 2.0;    // candle height; the top of the wax is y = 0
const GLOW = 0.45;
const WARM = new THREE.Color(1.0, 0.62, 0.3);
const COOL = new THREE.Color(0.35, 0.5, 1.0);
const add = (u: Record<string, THREE.IUniform>, vertexShader: string, fragmentShader: string) =>
  new THREE.ShaderMaterial({ uniforms: u, vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const ease = (from: number, to: number, dt: number, rate: number) => from + (to - from) * (1 - Math.exp(-dt * rate));

class Candle {
  group = new THREE.Group();
  flame: THREE.Mesh;
  flameMat: THREE.ShaderMaterial;
  moteMat: THREE.ShaderMaterial;
  waxMat: THREE.ShaderMaterial;
  light = new THREE.PointLight(0xffffff, 1, 7, 2);
  g: number;
  target: number;
  time = 0;
  phase = 0;

  constructor(g: number, seed: number, parts: { body: THREE.Mesh; top: THREE.Mesh; wick: THREE.Mesh; dish: THREE.Mesh }) {
    this.g = this.target = g;
    for (const m of Object.values(parts)) this.group.add(m.clone());
    const plane = new THREE.PlaneGeometry(1.9, 4.1);
    plane.translate(0, 1.35, 0);
    this.flameMat = add({ uTime: { value: 0 }, uG: { value: g }, uFade: { value: 1 }, uSeed: { value: seed } }, FLAME_VERT, FLAME_FRAG);
    this.flame = new THREE.Mesh(plane, this.flameMat);
    const count = 44;
    const seeds = new Float32Array(count * 3).map((_, i) => ((Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453) % 1 + 1) % 1);
    const motes = new THREE.BufferGeometry();
    motes.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    motes.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));
    this.moteMat = add({ uPhase: { value: seed }, uG: { value: g }, uFade: { value: 1 }, uPx: { value: 1 } }, MOTE_VERT, MOTE_FRAG);
    const points = new THREE.Points(motes, this.moteMat);
    points.frustumCulled = false;
    this.waxMat = add({ uColor: { value: new THREE.Color() }, uAmount: { value: 0 }, uTop: { value: GLOW / 2 } }, WAX_VERT, WAX_FRAG);
    const wax = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.01, R * 1.01, GLOW, 48, 1, true), this.waxMat);
    wax.position.y = -GLOW / 2;
    this.light.position.set(0, 0.55, 0.2);
    this.group.add(wax, this.flame, points, this.light);
  }

  /** Advance the flame's own clock; it runs slower as gravity fades, so the sphere glows steadily. */
  step(dt: number, fade: number, animate: boolean) {
    this.g = animate ? ease(this.g, this.target, dt, 2.4) : this.target;
    const g = this.g;
    this.time += dt * (0.35 + 0.65 * g);
    this.phase += dt * (0.04 + 0.3 * g);
    const t = this.time + this.flameMat.uniforms.uSeed.value * 17;
    const flicker = 1 + 0.12 * g * (Math.sin(t * 7.3) * 0.5 + Math.sin(t * 12.1 + 1) * 0.3 + Math.sin(t * 3.4) * 0.2);
    const f = this.flameMat.uniforms, m = this.moteMat.uniforms;
    f.uTime.value = this.time;
    f.uG.value = m.uG.value = g;
    f.uFade.value = m.uFade.value = fade;
    m.uPhase.value = this.phase;
    this.waxMat.uniforms.uColor.value.copy(COOL).lerp(WARM, g);
    this.waxMat.uniforms.uAmount.value = (0.06 + 0.3 * g) * flicker * fade;
    this.light.color.copy(COOL).lerp(WARM, g);
    this.light.intensity = (0.25 + 1.0 * g) * flicker * fade;
  }
}

export class FreefallScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  private earth: Candle;
  private micro: Candle;
  private split = 1;
  private splitTarget = 1;
  private halfW = 3;
  private raf = 0;
  private last = 0;
  private visible = false;
  private paused = false;
  private io: IntersectionObserver;
  private ro: ResizeObserver;

  constructor(private host: HTMLElement, private opts: FreefallOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    const night = new THREE.Color(opts.night || "#0e1428");
    this.renderer.setClearColor(night);
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(this.renderer.domElement);
    this.scene.fog = new THREE.Fog(night, 14, 30);

    // shared parts: cream wax, a glossy melt pool, a dark wick and a small metal dish
    const wax = new THREE.MeshStandardMaterial({ color: 0xefe6d6, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.03, H, 48), wax);
    body.position.y = -H / 2;
    const top = new THREE.Mesh(new THREE.CircleGeometry(R * 0.86, 48), new THREE.MeshStandardMaterial({ color: 0xf6eddd, roughness: 0.2 }));
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.002;
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.24, 8), new THREE.MeshStandardMaterial({ color: 0x17120e, roughness: 0.9 }));
    wick.position.y = 0.12;
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.7, R * 1.85, 0.06, 48), new THREE.MeshStandardMaterial({ color: 0x3a4152, roughness: 0.35, metalness: 0.4 }));
    dish.position.y = -H + 0.03;
    const parts = { body, top, wick, dish };
    this.earth = new Candle(1, 0.37, parts);
    this.micro = new Candle(0, 0.71, parts);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshStandardMaterial({ color: 0x161c30, roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -H;
    // a cool rim from behind and a soft fill from the viewer, so the wax reads in the dark
    const rim = new THREE.DirectionalLight(0x7d90c8, 0.6);
    rim.position.set(-2, 4, -5);
    const fill = new THREE.DirectionalLight(0xf2e9dc, 0.6);
    fill.position.set(1.5, 2, 6);
    this.scene.add(this.earth.group, this.micro.group, floor, rim, fill, new THREE.HemisphereLight(0xaab4d0, 0x0b0f1c, 0.6));

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    // draw only while on screen
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; this.kick(); });
    this.io.observe(host);
    this.resize();
  }

  private get animate() { return !this.opts.reducedMotion && !this.paused; }

  /** Fit the scene's height (and a minimum width) at any aspect; in "compare" the candles sit at a quarter and three quarters across. */
  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const tv = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const th = tv * this.camera.aspect;
    const halfH = 2.5;
    const dist = Math.max(halfH / tv, 2.4 / th);
    this.halfW = dist * th;
    const aim = new THREE.Vector3(0, 0.2, 0);
    this.camera.position.copy(aim).addScaledVector(new THREE.Vector3(0, 0.16, 1).normalize(), dist);
    this.camera.lookAt(aim);
    const px = (h * this.renderer.getPixelRatio()) / (2 * tv);
    this.earth.moteMat.uniforms.uPx.value = this.micro.moteMat.uniforms.uPx.value = px;
    this.frame(0);
  }

  /** Show both candles, or one whose flame follows the gravity switch. */
  set(view: View, gravityOn: boolean) {
    this.splitTarget = view === "compare" ? 1 : 0;
    this.earth.target = view === "compare" || gravityOn ? 1 : 0;
    this.kick();
  }

  /** The site's Pause switch: hold a still frame (the switches still change it). */
  setPaused(p: boolean) {
    this.paused = p;
    this.kick();
  }

  private kick() {
    if (this.raf || !this.visible) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private loop = (now: number) => {
    this.raf = 0;
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.frame(this.animate ? dt : 0);
    if (this.animate && this.visible) this.raf = requestAnimationFrame(this.loop);
  };

  private frame(dt: number) {
    const animate = this.animate;
    this.split = animate ? ease(this.split, this.splitTarget, dt, 5) : this.splitTarget;
    const x = this.halfW / 2;
    this.earth.group.position.x = -x * this.split;
    // the second candle slides out of frame (kept in the scene so the light count, and so the shaders, never change)
    this.micro.group.position.x = x * (1 + (1 - this.split) * 2.2);
    // a still frame (reduced motion, Pause) shows the flames at a settled moment, not at time zero
    const still = animate ? dt : this.earth.time === 0 ? 2.2 : 0;
    this.earth.step(still, 1, animate);
    this.micro.step(still, this.split, animate);
    this.earth.flame.quaternion.copy(this.camera.quaternion);
    this.micro.flame.quaternion.copy(this.camera.quaternion);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.io.disconnect();
    this.ro.disconnect();
    const seen = new Set<{ dispose(): void }>();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) seen.add(m.geometry);
      for (const mat of ([] as THREE.Material[]).concat(m.material ?? [])) seen.add(mat);
    });
    seen.forEach((d) => d.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
