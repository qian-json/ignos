// Written with AI assistance (Claude Code)
// The Story page's space views, drawn entirely in code: a stylized Earth (invented ocean and clouds
// under a latitude/longitude grid, no map data), its atmosphere glow, a star field, and in the Moon
// view a stylized Moon beside it. Not to scale. The only real values here arrive through setLive():
// the station's live position and the subsolar point, both from the live feed the page fetched.
import * as THREE from "three";

export type SpaceMode = "earth" | "moon";
export interface LiveFix { lat: number; lon: number; sunLat: number | null; sunLon: number | null }
export interface SpaceOptions {
  mode: SpaceMode;
  still: boolean;
  colors: { marker: string; glow: string; grid: string };
  /** HTML labels the scene keeps pinned to its bodies: earth, moon, iss. */
  labels: Partial<Record<"earth" | "moon" | "iss", HTMLElement | null>>;
}

/** The most fixes the trail keeps. */
export const TRAIL_MAX = 120;

/** A unit vector in the globe's own frame: +y north, longitude 0 on +x, east toward -z. */
export function toVec(lat: number, lon: number, r = 1) {
  const p = THREE.MathUtils.degToRad(lat), l = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l)).multiplyScalar(r);
}

const NOISE = /* glsl */ `
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 3.1; a *= 0.5; } return s; }`;

const VERT = /* glsl */ `
  varying vec3 vObj; varying vec3 vNw; varying vec3 vPw;
  void main() {
    vObj = position;
    vNw = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0); vPw = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const EARTH_FRAG = /* glsl */ `
  uniform vec3 uSun; uniform vec3 uSunW; uniform float uTime; uniform vec3 uGrid; uniform vec3 uGlow;
  varying vec3 vObj; varying vec3 vNw; varying vec3 vPw;
  ${NOISE}
  float line(float d, float w) { return 1.0 - smoothstep(w * 0.4, w, d); }
  void main() {
    vec3 n = normalize(vObj);
    float day = dot(n, uSun);
    float lit = smoothstep(-0.1, 0.3, day);
    vec3 ocean = mix(vec3(0.02, 0.07, 0.2), vec3(0.05, 0.22, 0.42), smoothstep(0.3, 0.75, fbm(n * 3.0)));
    vec3 q = n * 3.6 + vec3(uTime * 0.012, 0.0, uTime * 0.006);
    float c = fbm(q + 1.5 * fbm(q * 1.8)) * (0.78 + 0.22 * cos(n.y * 8.0));
    float cloud = smoothstep(0.46, 0.76, c);
    vec3 col = mix(ocean, vec3(0.93, 0.95, 1.0), cloud);
    vec3 N = normalize(vNw); vec3 V = normalize(cameraPosition - vPw);
    float spec = pow(max(dot(reflect(-uSunW, N), V), 0.0), 140.0) * (1.0 - cloud) * lit;
    vec3 night = vec3(0.01, 0.02, 0.05) + vec3(0.03, 0.05, 0.1) * cloud;
    vec3 rgb = mix(night, col * (0.25 + 0.85 * max(day, 0.0)), lit) + spec * vec3(1.0, 0.92, 0.8) * 0.45;
    rgb += vec3(0.9, 0.42, 0.18) * exp(-pow(day * 12.0, 2.0)) * 0.07;
    float lat = asin(clamp(n.y, -1.0, 1.0)); float lon = atan(-n.z, n.x); float s = radians(30.0);
    float g = max(line(abs(fract(lat / s + 0.5) - 0.5) * s, 0.007), line(abs(fract(lon / s + 0.5) - 0.5) * s * cos(lat), 0.007));
    float key = max(line(abs(lat), 0.01), line(abs(lon) * cos(lat), 0.01));
    rgb += uGrid * (g * 0.1 + key * 0.18) * (0.35 + 0.65 * lit);
    rgb += uGlow * pow(1.0 - max(dot(N, V), 0.0), 3.0) * (0.1 + 0.4 * lit);
    gl_FragColor = vec4(rgb, 1.0);
  }`;

const MOON_FRAG = /* glsl */ `
  uniform vec3 uSunW; varying vec3 vObj; varying vec3 vNw; varying vec3 vPw;
  ${NOISE}
  float cells(vec3 p) {
    vec3 i = floor(p), f = fract(p); float d = 1.0;
    for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
      vec3 g = vec3(float(x), float(y), float(z));
      vec3 o = vec3(hash(i + g), hash(i + g + 11.3), hash(i + g + 27.1));
      d = min(d, length(g + o - f));
    }
    return d;
  }
  void main() {
    vec3 n = normalize(vObj);
    float base = 0.55 + 0.25 * fbm(n * 5.0) - 0.22 * smoothstep(0.45, 0.6, fbm(n * 1.6 + 4.0));
    float k = 0.0;
    for (int i = 0; i < 2; i++) {
      float d = cells(n * (4.0 + 5.0 * float(i)));
      k += (smoothstep(0.22, 0.3, d) * (1.0 - smoothstep(0.3, 0.38, d)) * 0.18 - (1.0 - smoothstep(0.05, 0.26, d)) * 0.1) / (1.0 + float(i));
    }
    vec3 N = normalize(vNw);
    float l = max(dot(N, uSunW), 0.0);
    vec3 rgb = vec3(0.86, 0.85, 0.82) * clamp(base + k, 0.0, 1.0) * (0.04 + 1.05 * l);
    gl_FragColor = vec4(rgb, 1.0);
  }`;

const ATMO_FRAG = /* glsl */ `
  uniform vec3 uGlow; uniform vec3 uSunW; varying vec3 vObj; varying vec3 vNw; varying vec3 vPw;
  void main() {
    vec3 V = normalize(cameraPosition - vPw);
    float i = pow(clamp(0.72 + dot(normalize(vNw), V), 0.0, 1.0), 5.0);
    float side = 0.3 + 0.7 * smoothstep(-0.4, 0.6, dot(normalize(vNw), uSunW));
    // coverage in alpha, so the glow fades into the page behind the transparent canvas
    float k = clamp(i * side * 1.4, 0.0, 1.0);
    gl_FragColor = vec4(uGlow * k, k);
  }`;

/** A soft round dot, drawn on a canvas, for glows. */
function glowTexture(color: string) {
  const c = Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
  const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  [[0, color], [0.25, color], [1, "rgba(0,0,0,0)"]].forEach(([at, c2]) => r.addColorStop(at as number, c2 as string));
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** A seeded random stream, so the stars sit in the same places on every visit. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export class SpaceScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  private earth = new THREE.Group();
  private earthMat: THREE.ShaderMaterial; private atmoMat: THREE.ShaderMaterial;
  private moonMat: THREE.ShaderMaterial | null = null; private moon: THREE.Mesh | null = null;
  private marker = new THREE.Group();
  private ring: THREE.Mesh; private trail: THREE.Line;
  private sunLocal = new THREE.Vector3(0.55, 0.35, 0.75).normalize();
  private fix: LiveFix | null = null;
  private yaw = 0.6; private pitch = 0.25;
  private raf = 0; private last = 0; private time = 0;
  private visible = false; private ro: ResizeObserver;
  private disposables: { dispose(): void }[] = [];

  constructor(private host: HTMLElement, private opts: SpaceOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.prepend(this.renderer.domElement);
    const col = (c: string) => new THREE.Color(c);
    const sphere = new THREE.SphereGeometry(1, 96, 64);
    this.earthMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: EARTH_FRAG,
      uniforms: { uSun: { value: new THREE.Vector3() }, uSunW: { value: new THREE.Vector3() }, uTime: { value: 0 }, uGrid: { value: col(opts.colors.grid) }, uGlow: { value: col(opts.colors.glow) } },
    });
    this.atmoMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: ATMO_FRAG, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
      uniforms: { uGlow: { value: col(opts.colors.glow) }, uSunW: { value: new THREE.Vector3() } },
    });
    const atmo = new THREE.Mesh(sphere, this.atmoMat);
    atmo.scale.setScalar(1.12);
    this.earth.add(new THREE.Mesh(sphere, this.earthMat));
    this.scene.add(this.earth, atmo);
    this.disposables.push(sphere, this.earthMat, this.atmoMat);

    // the station: a bright dot just off the surface, a glow, a pulsing ring, and the trail of fixes fetched this visit
    const dotGeo = new THREE.SphereGeometry(0.016, 16, 12);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const tex = glowTexture(opts.colors.marker);
    const glowMat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(0.16);
    const ringGeo = new THREE.RingGeometry(0.03, 0.036, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: col(opts.colors.marker), transparent: true, side: THREE.DoubleSide, depthWrite: false });
    this.ring = new THREE.Mesh(ringGeo, ringMat);
    this.marker.add(new THREE.Mesh(dotGeo, dotMat), glow, this.ring);
    this.marker.visible = false;
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 3), 3));
    trailGeo.setDrawRange(0, 0);
    const trailMat = new THREE.LineBasicMaterial({ color: col(opts.colors.marker), transparent: true, opacity: 0.55 });
    this.trail = new THREE.Line(trailGeo, trailMat);
    this.trail.frustumCulled = false;
    this.earth.add(this.marker, this.trail);
    this.disposables.push(dotGeo, dotMat, tex, glowMat, ringGeo, ringMat, trailGeo, trailMat);

    // stars: fixed points on a far shell
    const rand = seeded(7);
    const stars = Array.from({ length: 1400 }, () => new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize().multiplyScalar(60 + rand() * 30));
    const starGeo = new THREE.BufferGeometry().setFromPoints(stars);
    const starMat = new THREE.PointsMaterial({ color: 0xc9d3ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8 });
    this.scene.add(new THREE.Points(starGeo, starMat));
    this.disposables.push(starGeo, starMat);

    if (opts.mode === "moon") {
      const moonGeo = new THREE.SphereGeometry(1, 96, 64);
      this.moonMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: MOON_FRAG, uniforms: { uSunW: { value: new THREE.Vector3() } } });
      this.moon = new THREE.Mesh(moonGeo, this.moonMat);
      this.moon.scale.setScalar(0.34);
      this.moon.position.set(1.75, 0.35, -0.4);
      this.earth.position.set(-0.75, -0.15, 0);
      this.earth.scale.setScalar(0.92);
      atmo.position.copy(this.earth.position);
      atmo.scale.setScalar(0.92 * 1.12);
      this.scene.add(this.moon);
      this.disposables.push(moonGeo, this.moonMat);
      this.camera.position.set(0.2, 0.2, 7.2);
    } else {
      this.camera.position.set(0, 0, 4.6);
    }
    this.camera.lookAt(this.opts.mode === "moon" ? new THREE.Vector3(0.2, 0.05, 0) : new THREE.Vector3());

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  /** The live fix (or null when the feed failed: no marker, stylized light). Trail: earlier fixes this visit. */
  setLive(fix: LiveFix | null, trail: { lat: number; lon: number }[]) {
    this.fix = fix;
    this.marker.visible = !!fix && this.opts.mode === "earth";
    if (fix) {
      const p = toVec(fix.lat, fix.lon, 1.05);
      this.marker.position.copy(p);
      // the ring lies flat on the surface: its normal (+z) along the local up, in the globe's own frame
      this.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.clone().normalize());
      if (fix.sunLat !== null && fix.sunLon !== null) this.sunLocal = toVec(fix.sunLat, fix.sunLon);
    }
    const pts = fix ? trail.slice(-TRAIL_MAX) : [];
    const attr = this.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
    pts.forEach((t, i) => { const v = toVec(t.lat, t.lon, 1.05); attr.setXYZ(i, v.x, v.y, v.z); });
    attr.needsUpdate = true;
    this.trail.geometry.setDrawRange(0, pts.length);
    this.trail.visible = pts.length > 1;
    this.kick();
  }

  setStill(still: boolean) { this.opts.still = still; this.kick(); }
  setVisible(v: boolean) { this.visible = v; this.kick(); }

  private resize() {
    const w = Math.max(this.host.clientWidth, 1), h = Math.max(this.host.clientHeight, 1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the bodies inside narrow frames: pull back when the frame is taller than it is wide
    this.camera.zoom = Math.min(1, (w / h) * (this.opts.mode === "moon" ? 0.7 : 1.15));
    this.camera.updateProjectionMatrix();
    this.kick();
  }

  private kick() {
    if (!this.raf && this.visible) { this.last = performance.now(); this.raf = requestAnimationFrame(this.tick); }
  }

  /** Turn the globe toward its target; true while still turning. */
  private steer(dt: number): boolean {
    const still = this.opts.still;
    let ty = this.yaw, tp = this.pitch;
    if (this.fix && this.opts.mode === "earth") {
      ty = -Math.PI / 2 - THREE.MathUtils.degToRad(this.fix.lon) + 0.35;
      tp = THREE.MathUtils.degToRad(this.fix.lat) * 0.6;
    } else if (!still) ty += dt * 0.05;
    let dy = Math.atan2(Math.sin(ty - this.yaw), Math.cos(ty - this.yaw));
    const k = still ? 1 : 1 - Math.exp(-dt * 2.2);
    this.yaw += dy * k; this.pitch += (tp - this.pitch) * k;
    dy = Math.atan2(Math.sin(ty - this.yaw), Math.cos(ty - this.yaw));
    return Math.abs(dy) + Math.abs(tp - this.pitch) > 1e-4;
  }

  private tick = (now: number) => {
    this.raf = 0;
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    const still = this.opts.still;
    if (!still) this.time += dt;
    const turning = this.steer(dt);
    this.earth.rotation.set(this.pitch, this.yaw, 0, "XYZ");
    this.earth.updateMatrixWorld();
    const sunW = (this.opts.mode === "moon" ? new THREE.Vector3(0.9, 0.3, 0.6).normalize() : this.sunLocal.clone().applyQuaternion(this.earth.quaternion));
    if (this.opts.mode === "moon") this.sunLocal = sunW.clone().applyQuaternion(this.earth.quaternion.clone().invert());
    this.earthMat.uniforms.uSun.value.copy(this.sunLocal);
    this.earthMat.uniforms.uSunW.value.copy(sunW);
    this.earthMat.uniforms.uTime.value = this.time;
    this.atmoMat.uniforms.uSunW.value.copy(sunW);
    if (this.moonMat && this.moon) { this.moonMat.uniforms.uSunW.value.copy(sunW); this.moon.rotation.y = this.time * 0.03; }
    const pulse = still ? 0.5 : (this.time * 0.8) % 1;
    this.ring.scale.setScalar(1 + pulse * 2.2);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - pulse);
    this.renderer.render(this.scene, this.camera);
    this.pin();
    if (this.visible && (!still || turning)) this.raf = requestAnimationFrame(this.tick);
  };

  /** Keep the HTML labels next to their bodies; hide the station's when it is behind the globe. */
  private pin() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const place = (el: HTMLElement | null | undefined, world: THREE.Vector3, show = true) => {
      if (!el) return;
      const p = world.clone().project(this.camera);
      el.style.left = `${((p.x + 1) / 2) * w}px`;
      el.style.top = `${((1 - p.y) / 2) * h}px`;
      el.dataset.show = String(show);
    };
    const L = this.opts.labels;
    const er = this.earth.scale.x;
    place(L.earth, this.earth.position.clone().add(new THREE.Vector3(0, -er * 1.08, 0)));
    if (this.moon) place(L.moon, this.moon.position.clone().add(new THREE.Vector3(0, -this.moon.scale.x * 1.25, 0)));
    if (L.iss) {
      const wp = this.marker.getWorldPosition(new THREE.Vector3());
      const facing = wp.clone().sub(this.earth.position).normalize().dot(this.camera.position.clone().sub(wp).normalize()) > 0.05;
      place(L.iss, wp, this.marker.visible && facing);
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro.disconnect();
    this.disposables.forEach((d) => d.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

export function webglAvailable(): boolean {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}
