// Written with AI assistance (Claude Code)
// WebGL housekeeping shared by every 3D canvas on the site. three.js (0.185) draws with WebGL 2 only, so
// a browser that offers just WebGL 1 counts as "no 3D" and keeps the flat view. A probe gives its context
// back at once, and a scene that is put away force-loses its own (renderer.dispose() alone keeps the
// context alive until garbage collection), so moving around the site never reaches the browser's cap on
// live contexts; at the cap the browser drops the oldest one and that canvas freezes on its last frame.

/** True when this browser can start WebGL 2. The probe's context is released straight away. */
export function webgl2Available(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Tell a scene when its canvas loses its WebGL context (GPU reset, sleep, too many contexts) and when the
 * browser hands it back. preventDefault() on the loss asks the browser to restore it. Returns a remover;
 * call it before forcing the loss yourself, so a deliberate dispose is not reported as a failure.
 */
export function watchContext(canvas: HTMLCanvasElement, onLost: () => void, onRestored: () => void): () => void {
  const lost = (e: Event) => { e.preventDefault(); onLost(); };
  canvas.addEventListener("webglcontextlost", lost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  return () => {
    canvas.removeEventListener("webglcontextlost", lost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
  };
}
