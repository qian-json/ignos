// Written with AI assistance (Claude Code)
// The sign-off wordmark as horizontal slats that a passing pointer pushes sideways, like a draught
// through louvres, and that then settle still. The pointer writes its velocity into a small flow
// field (128 x 128, half float, two buffers swapped each frame); every frame the field fades by 5%,
// so nothing springs back: the push simply dies away in about a second. Each slat reads the field
// along its own centre line, so a slat bends sideways as one band and the gaps between slats stay
// put. Only horizontal motion moves the ink.
// Drawn from the page's own text element, so the live mark and the still one (CSS) coincide.
import * as THREE from "three";
import { watchContext } from "../three/webgl";

export interface Draught {
  /** Start or stop the frame loop (off screen, hidden tab, Pause). Stopping clears the push. */
  setRunning(on: boolean): void;
  /** A gentle one-time push across the word, for visitors without a pointer. */
  sweep(): void;
  /** Redraw after a size or font change. */
  resize(): void;
  dispose(): void;
}

// flow field: how strongly the pointer's speed (px/ms) shifts the ink, and how fast it fades
const AMOUNT = 0.06;
const FADE = 0.95; // per 60 Hz frame
const FALLOFF = 0.3; // stamp radius in field units, width scaled by the aspect
const FAST = 1.5; // px/ms: above it the stamp follows the pointer at once, below it creeps
const MAX_V = 1.4;
const SWEEP_MS = 1100;
const SWEEP_V = 0.8;

const VS = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";

/** onContext: false when the GPU context is lost (show the text mark), true once it is back. */
export function startDraught(canvas: HTMLCanvasElement, box: HTMLElement, textEl: HTMLElement, onContext?: (ok: boolean) => void): Draught | null {
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
  } catch {
    gl = null;
  }
  if (!gl || !(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"))) return null;

  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, premultipliedAlpha: true, antialias: false });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  const cam = new THREE.Camera();
  const tri = new THREE.BufferGeometry();
  tri.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  tri.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));

  const rtOpt = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  let fa = new THREE.WebGLRenderTarget(128, 128, rtOpt);
  let fb = new THREE.WebGLRenderTarget(128, 128, rtOpt);

  const flowMat = new THREE.ShaderMaterial({
    vertexShader: VS,
    depthTest: false,
    depthWrite: false,
    fragmentShader: /* glsl */ `
      precision highp float; varying vec2 vUv;
      uniform sampler2D tMap; uniform float uFalloff, uFade, uAspect; uniform vec2 uPos, uVel;
      void main(){
        vec4 c = texture2D(tMap, vUv) * uFade;
        vec2 d = vUv - uPos; d.x *= uAspect;
        vec3 stamp = vec3(uVel * vec2(1.0, -1.0), 1.0 - pow(1.0 - min(1.0, length(uVel)), 3.0));
        c.rgb = mix(c.rgb, stamp, vec3(smoothstep(uFalloff, 0.0, length(d))));
        gl_FragColor = c;
      }`,
    uniforms: {
      tMap: { value: fa.texture },
      uFalloff: { value: FALLOFF },
      uFade: { value: FADE },
      uAspect: { value: 3 },
      uPos: { value: new THREE.Vector2(-1, -1) },
      uVel: { value: new THREE.Vector2() },
    },
  });
  const flowScene = new THREE.Scene();
  const fm = new THREE.Mesh(tri, flowMat);
  fm.frustumCulled = false;
  flowScene.add(fm);

  const word = document.createElement("canvas");
  const tex = new THREE.CanvasTexture(word);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const markMat = new THREE.ShaderMaterial({
    vertexShader: VS,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    fragmentShader: /* glsl */ `
      precision highp float; varying vec2 vUv;
      uniform sampler2D tWord, tFlow; uniform vec2 uSize; uniform float uTop, uPitch, uInk, uAmount; uniform vec3 uColor;
      void main(){
        // slats: horizontal bands of ink, measured from the text's own top, like its CSS mask
        float py = (1.0 - vUv.y) * uSize.y - uTop;
        float slat = floor(py / uPitch);
        float inSlat = py - slat * uPitch;
        float m = 1.0 - smoothstep(uInk - 0.6, uInk + 0.6, inSlat);
        // the whole band reads the field on its centre line, so it bends sideways as one
        float cy = 1.0 - (uTop + (slat + 0.5) * uPitch) / uSize.y;
        float fx = texture2D(tFlow, vec2(vUv.x, clamp(cy, 0.0, 1.0))).x;
        float a = texture2D(tWord, vec2(vUv.x - fx * uAmount, vUv.y)).a * m;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    uniforms: {
      tWord: { value: tex },
      tFlow: { value: fa.texture },
      uSize: { value: new THREE.Vector2(1, 1) },
      uTop: { value: 0 },
      uPitch: { value: 10 },
      uInk: { value: 8 },
      uAmount: { value: AMOUNT },
      uColor: { value: new THREE.Color() },
    },
  });
  const markScene = new THREE.Scene();
  const mm = new THREE.Mesh(tri, markMat);
  mm.frustumCulled = false;
  markScene.add(mm);

  let aspect = 3;
  function drawWord() {
    const r = box.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    aspect = r.width / r.height;
    const W = Math.round(r.width * dpr);
    const H = Math.round(r.height * dpr);
    word.width = W;
    word.height = H;
    const cs = getComputedStyle(textEl);
    const t = textEl.getBoundingClientRect();
    const size = parseFloat(cs.fontSize);
    const ctx = word.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.scale(dpr, dpr);
    ctx.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
    if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "alphabetic";
    const m = ctx.measureText(textEl.textContent ?? "");
    const lh = cs.lineHeight === "normal" ? size * 1.2 : parseFloat(cs.lineHeight);
    const top = t.top - r.top + parseFloat(cs.paddingTop);
    // where CSS puts the baseline: half the leading, then the font's ascent
    const base = top + (lh - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
    ctx.fillText(textEl.textContent ?? "", t.left - r.left + parseFloat(cs.paddingLeft), base);
    tex.needsUpdate = true;
    const pitch = parseFloat(cs.getPropertyValue("--slat-pitch")) || 0.06;
    const ink = parseFloat(cs.getPropertyValue("--slat-ink")) || 0.78;
    markMat.uniforms.uSize.value.set(W, H);
    markMat.uniforms.uTop.value = top * dpr;
    markMat.uniforms.uPitch.value = pitch * size * dpr;
    markMat.uniforms.uInk.value = pitch * ink * size * dpr;
    (markMat.uniforms.uColor.value as THREE.Color).setStyle(cs.color, THREE.LinearSRGBColorSpace);
  }

  // pointer: position in field units (y up) and speed in px/ms over at least 14 ms
  const ptr = { pos: new THREE.Vector2(-1, -1), vel: new THREE.Vector2(), lx: 0, ly: 0, lt: 0, fresh: false };
  const flowVel = flowMat.uniforms.uVel.value as THREE.Vector2;
  let running = false;
  let raf = 0;
  let last = 0;
  let quiet = 0; // frames since the last push
  let sweepAt = -1;

  const near = (x: number, y: number) => {
    const r = canvas.getBoundingClientRect();
    return x > r.left - 80 && x < r.right + 80 && y > r.top - 80 && y < r.bottom + 80;
  };
  const move = (x: number, y: number) => {
    if (!running || !near(x, y)) {
      ptr.lt = 0;
      return;
    }
    const t = performance.now();
    const r = canvas.getBoundingClientRect();
    ptr.pos.set((x - r.left) / r.width, 1 - (y - r.top) / r.height);
    if (!ptr.lt) {
      ptr.lt = t;
      ptr.lx = x;
      ptr.ly = y;
    }
    const dt = Math.max(14, t - ptr.lt);
    ptr.vel.set((x - ptr.lx) / dt, (y - ptr.ly) / dt).clampLength(0, MAX_V);
    ptr.lx = x;
    ptr.ly = y;
    ptr.lt = t;
    ptr.fresh = true;
    wake();
  };
  const onPointer = (e: PointerEvent) => { if (e.pointerType !== "touch") move(e.clientX, e.clientY); };
  const onTouch = (e: TouchEvent) => { const p = e.changedTouches[0]; if (p) move(p.clientX, p.clientY); };
  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("touchmove", onTouch, { passive: true });

  function clearFlow() {
    for (const rt of [fa, fb]) {
      renderer.setRenderTarget(rt);
      renderer.clear();
    }
    renderer.setRenderTarget(null);
    flowVel.set(0, 0);
  }

  function render() {
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(markScene, cam);
  }

  function frame(now: number) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let pushing = false;
    if (sweepAt >= 0) {
      // the one-time push: a soft breath from left to right along the middle of the word
      const p = (now - sweepAt) / SWEEP_MS;
      if (p >= 1) sweepAt = -1;
      else {
        flowMat.uniforms.uPos.value.set(-0.1 + 1.2 * p, 0.5);
        flowVel.set(SWEEP_V * Math.sin(Math.PI * p), 0);
        pushing = true;
      }
    }
    if (!pushing) {
      if (ptr.fresh) {
        flowMat.uniforms.uPos.value.copy(ptr.pos);
        flowVel.lerp(ptr.vel, ptr.vel.length() > FAST ? 0.5 : 0.05);
        pushing = true;
      } else {
        flowMat.uniforms.uPos.value.set(-9, -9);
        flowVel.lerp(new THREE.Vector2(), 0.05);
      }
    }
    ptr.fresh = false;
    quiet = pushing ? 0 : quiet + 1;
    flowMat.uniforms.uAspect.value = aspect;
    flowMat.uniforms.uFade.value = Math.pow(FADE, dt * 60);
    flowMat.uniforms.tMap.value = fa.texture;
    renderer.setRenderTarget(fb);
    renderer.render(flowScene, cam);
    [fa, fb] = [fb, fa];
    markMat.uniforms.tFlow.value = fa.texture;
    render();
    // after about two and a half quiet seconds the field is flat: stop until the next push
    if (running && quiet < 150) raf = requestAnimationFrame(frame);
    else last = 0;
  }

  function wake() {
    if (running && !raf) raf = requestAnimationFrame(frame);
  }

  drawWord();
  clearFlow();
  render();

  // three.js rebuilds its GPU state when the context comes back; the field starts flat again
  const unwatch = watchContext(canvas, () => {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    onContext?.(false);
  }, () => {
    drawWord();
    clearFlow();
    render();
    onContext?.(true);
    wake();
  });

  return {
    setRunning(on) {
      if (on === running) return;
      running = on;
      if (on) return wake();
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
      sweepAt = -1;
      clearFlow();
      render();
    },
    sweep() {
      if (!running) return;
      sweepAt = performance.now();
      quiet = 0;
      wake();
    },
    resize() {
      drawWord();
      render();
    },
    dispose() {
      unwatch();
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("touchmove", onTouch);
      fa.dispose();
      fb.dispose();
      tex.dispose();
      flowMat.dispose();
      markMat.dispose();
      tri.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
