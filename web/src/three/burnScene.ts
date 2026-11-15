// Written with AI assistance (Claude Code)
// The burn replay: a PMMA rod in the duct whose flame front sits where the tracker measured it,
// photo by photo. Geometry is in millimetres. Nothing here is a scientific value: positions,
// flame lengths and airflows all arrive from the data files through `update()`.
import * as THREE from "three";

export interface BurnState {
  /** Leading-edge position along the rod (mm from the first axis click), or null with no flame. */
  edgeMm: number | null;
  /** Visible flame length for the current fan step (mm), from spread_rates.csv. */
  flameLenMm: number | null;
  /** Opposed airflow for the current fan step (cm/s); only drives the arrows' speed. */
  flowCmS: number | null;
}

export interface SceneOptions {
  rodLengthMm: number;
  rodDiameterMm: number;
  /** Edge positions seen in the test, for framing. */
  edgeMinMm: number;
  edgeMaxMm: number;
  colors: { flame: string; front: string; rod: string; char: string; ink: string; rule: string };
  reducedMotion: boolean;
}

const FLAME_VERT = /* glsl */ `
  varying vec3 vN; varying vec3 vV; varying float vU;
  void main() {
    // the cylinder is turned so uv.y = 1 sits at the trailing end; flip it so 1 is the leading edge
    vU = 1.0 - uv.y;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const FLAME_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uTime; uniform float uOpacity;
  varying vec3 vN; varying vec3 vV; varying float vU;
  void main() {
    float facing = abs(dot(vN, vV));
    float rim = pow(1.0 - facing, 2.0);
    // brightest just behind the leading edge (vU = 1), fading out toward the trailing end
    float along = smoothstep(0.0, 0.7, vU) * smoothstep(1.0, 0.94, vU);
    float flicker = 0.9 + 0.1 * sin(uTime * 6.0 + vU * 11.0);
    float a = clamp((0.42 + 0.8 * rim) * along * flicker, 0.0, 1.0) * uOpacity;
    gl_FragColor = vec4(mix(uColor, vec3(0.86, 0.9, 1.0), 0.18 * (1.0 - rim)), a);
  }`;

export class BurnScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private rod: THREE.Mesh;
  private char: THREE.Mesh;
  private flame: THREE.Mesh;
  private flameMat: THREE.ShaderMaterial;
  private front: THREE.Mesh;
  private frontLight: THREE.PointLight;
  private glow: THREE.Sprite;
  private arrows: THREE.Group;
  private state: BurnState = { edgeMm: null, flameLenMm: null, flowCmS: null };
  private raf = 0;
  private visible = true;
  private paused = false;
  private clock = new THREE.Timer();
  private io: IntersectionObserver;
  private ro: ResizeObserver;
  private opts: SceneOptions;
  // the rod's tip (where it was lit) sits at x = 0; the edge moves toward +x, into the airflow
  constructor(private host: HTMLElement, opts: SceneOptions) {
    this.opts = opts;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    host.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(studio(), 0.02).texture;
    pmrem.dispose();

    const r = opts.rodDiameterMm / 2;
    const L = opts.rodLengthMm;
    const c = (s: string) => new THREE.Color(s);

    // the rod: glossy black cast PMMA, axis along x
    const rodGeo = new THREE.CylinderGeometry(r, r, 1, 64, 1, false);
    rodGeo.rotateZ(Math.PI / 2);
    rodGeo.translate(0.5, 0, 0);
    this.rod = new THREE.Mesh(rodGeo, new THREE.MeshPhysicalMaterial({ color: c(opts.colors.rod), roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.15 }));
    this.scene.add(this.rod);

    // the pyrolysed part behind the front: matte and slightly thinner
    const charGeo = new THREE.CylinderGeometry(r * 0.94, r * 0.86, 1, 48, 1, false);
    charGeo.rotateZ(Math.PI / 2);
    charGeo.translate(0.5, 0, 0);
    this.char = new THREE.Mesh(charGeo, new THREE.MeshStandardMaterial({ color: c(opts.colors.char), roughness: 0.85, metalness: 0 }));
    this.scene.add(this.char);

    // the flame envelope: a soft shell hugging the rod, brightest at the leading edge
    const flameGeo = new THREE.CylinderGeometry(r * 1.9, r * 1.35, 1, 64, 12, true);
    flameGeo.rotateZ(Math.PI / 2);
    flameGeo.translate(0.5, 0, 0);
    this.flameMat = new THREE.ShaderMaterial({
      vertexShader: FLAME_VERT,
      fragmentShader: FLAME_FRAG,
      uniforms: { uColor: { value: c(opts.colors.flame) }, uTime: { value: 0 }, uOpacity: { value: 0.9 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.flame = new THREE.Mesh(flameGeo, this.flameMat);
    this.scene.add(this.flame);

    // the measured front: a thin carmine ring at the edge position
    this.front = new THREE.Mesh(new THREE.TorusGeometry(r * 2.15, r * 0.07, 12, 96), new THREE.MeshBasicMaterial({ color: c(opts.colors.front) }));
    this.front.rotation.y = Math.PI / 2;
    this.scene.add(this.front);
    // a soft glow where the flame sits closest to fresh fuel
    const g = document.createElement("canvas");
    g.width = g.height = 128;
    const ctx = g.getContext("2d")!;
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    // fade to the same hue at zero alpha, so the edge of the glow doesn't go grey
    const fc = new THREE.Color(opts.colors.flame);
    const rgb = `${Math.round(fc.r * 255)}, ${Math.round(fc.g * 255)}, ${Math.round(fc.b * 255)}`;
    grad.addColorStop(0, `rgba(${rgb}, 0.9)`);
    grad.addColorStop(0.45, `rgba(${rgb}, 0.25)`);
    grad.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(g);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false }));
    this.glow.scale.set(r * 7, r * 7, 1);
    this.scene.add(this.glow);
    this.frontLight = new THREE.PointLight(c(opts.colors.flame), 40, r * 14, 2);
    this.scene.add(this.frontLight);

    // holder clamp at the far end
    const holder = new THREE.Mesh(new THREE.BoxGeometry(6, r * 4.2, r * 4.2), new THREE.MeshStandardMaterial({ color: c(opts.colors.rule), roughness: 0.5, metalness: 0.6 }));
    holder.position.set(L + 3, 0, 0);
    this.scene.add(holder);

    // a ruler under the rod, like the one in NASA's frames: a tick every millimetre, longer every 10
    const ticks: number[] = [];
    for (let mm = 0; mm <= L; mm++) {
      const h = mm % 10 === 0 ? 2.4 : mm % 5 === 0 ? 1.5 : 0.8;
      ticks.push(mm, -r * 2.6, 0, mm, -r * 2.6 - h, 0);
    }
    ticks.push(0, -r * 2.6, 0, L, -r * 2.6, 0);
    const tickGeo = new THREE.BufferGeometry();
    tickGeo.setAttribute("position", new THREE.Float32BufferAttribute(ticks, 3));
    this.scene.add(new THREE.LineSegments(tickGeo, new THREE.LineBasicMaterial({ color: c(opts.colors.ink), transparent: true, opacity: 0.55 })));

    // airflow: short streaks moving against the spread direction (toward the tip)
    this.arrows = new THREE.Group();
    const streakMat = new THREE.LineBasicMaterial({ color: c(opts.colors.ink), transparent: true, opacity: 0.12 });
    for (let i = 0; i < 18; i++) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-4, 0, 0)]);
      const line = new THREE.Line(g, streakMat);
      const ang = (i / 18) * Math.PI * 2;
      const rad = r * (2.8 + (i % 3) * 0.9);
      line.position.set(((i * 37) % 100) / 100 * (L + 10) - 5, Math.cos(ang) * rad, Math.sin(ang) * rad);
      this.arrows.add(line);
    }
    this.scene.add(this.arrows);

    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(-30, 60, 50);
    this.scene.add(key, new THREE.AmbientLight(0xffffff, 0.25));

    this.camera = new THREE.PerspectiveCamera(28, 1, 1, 4000);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (this.visible) this.loop(); });
    this.io.observe(host);
    this.resize();
  }

  /** Keep the whole rod and holder in frame at any aspect, from a fixed three-quarter direction. */
  private frame() {
    const L = this.opts.rodLengthMm;
    const span = L + 14; // rod plus holder
    // aim a little below the axis so the rod sits above the HUD strip
    const mid = new THREE.Vector3(L / 2 + 2, -this.opts.rodDiameterMm * 0.6 - 2, 0);
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const dist = Math.max((span * 0.62) / Math.tan(hfov / 2), (span * 0.34) / Math.tan(vfov / 2));
    const dir = new THREE.Vector3(-0.3, 0.36, 0.88).normalize();
    this.camera.position.copy(mid).addScaledVector(dir, dist);
    this.camera.lookAt(mid);
  }

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.frame();
    this.render();
  }

  /** Stops the flame flicker and the airflow streaks (the scene still redraws on every update). */
  setPaused(p: boolean) {
    this.paused = p;
    if (!p) this.loop();
  }

  update(s: BurnState) {
    this.state = s;
    const L = this.opts.rodLengthMm;
    const edge = s.edgeMm === null ? null : THREE.MathUtils.clamp(s.edgeMm, 0, L);
    const burntTo = edge ?? 0;
    // intact rod from the edge to the holder; the pyrolysed part from the tip to the edge
    this.rod.position.x = burntTo;
    this.rod.scale.x = Math.max(L - burntTo, 0.001);
    this.char.visible = burntTo > 0.01;
    this.char.scale.x = Math.max(burntTo, 0.001);
    const len = Math.min(s.flameLenMm ?? 0, burntTo + 2);
    const lit = edge !== null && len > 0;
    this.flame.visible = lit;
    this.front.visible = edge !== null;
    this.frontLight.visible = lit;
    this.glow.visible = lit;
    if (edge !== null) {
      this.front.position.x = edge;
      this.frontLight.position.set(edge - 1, 0, this.opts.rodDiameterMm * 1.2);
      this.glow.position.set(edge - 1.5, 0, 0);
      this.flame.position.x = edge - len;
      this.flame.scale.x = Math.max(len, 0.001);
    }
    this.render();
  }

  private render() {
    this.renderer.render(this.scene, this.camera);
  }

  private loop = () => {
    cancelAnimationFrame(this.raf);
    if (!this.visible) return;
    if (this.paused) { this.render(); return; }
    this.clock.update();
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.getElapsed();
    if (!this.opts.reducedMotion) {
      this.flameMat.uniforms.uTime.value = t;
      this.glow.material.opacity = 0.5 + 0.06 * Math.sin(t * 5.3);
      // streak speed follows the measured airflow, compressed so 0.7 and 7.5 cm/s both read
      const speed = this.state.flowCmS ? 6 + 10 * Math.log10(1 + this.state.flowCmS) : 0;
      const L = this.opts.rodLengthMm;
      for (const a of this.arrows.children) {
        a.position.x -= speed * dt;
        if (a.position.x < -8) a.position.x = L + 8;
      }
    }
    this.render();
    if (!this.opts.reducedMotion) this.raf = requestAnimationFrame(this.loop);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.io.disconnect();
    this.ro.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/**
 * A small photo studio for reflections: a dim cool room with one long softbox overhead, a strip
 * light at the back and a low fill card, so the glossy rod shows two clean highlights.
 */
function studio(): THREE.Scene {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x1a1f2b);
  const light = (w: number, h: number, c: number, pos: [number, number, number], rot: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.rotation.set(...rot);
    s.add(m);
  };
  light(6, 1.2, 0xffffff, [0, 3, 0], [Math.PI / 2, 0, 0]); // softbox overhead
  light(8, 0.35, 0xdfe6ff, [0, 1, -4], [0, 0, 0]); // strip behind
  light(3, 2, 0x5a6478, [3.5, 0, 2], [0, -Math.PI / 3, 0]); // fill card
  return s;
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
