// Written with AI assistance (Claude Code)
// The Orbit section's flame: an illustration, drawn as points, that the fan slider drives.
// Mounts the point engine on screen; without WebGL 2 it shows a drawn still of the same flame.
import { useEffect, useRef, useState } from "react";
import { flameField, hasWebGL2, type FlameField } from "./flamePoints";
import { useNearViewport } from "../three/useNearViewport";

/** What the picture shows at a fan setting (0 lowest, 1 highest), for the stage's label. */
function describe(f: number) {
  if (f > 0.66) return "strong fans: the flame streams away from the rod";
  if (f > 0.25) return "the fans turned down: the flame shortens";
  return "fans nearly off: the flame shrinks to a small glow and hangs almost still";
}

export function FlameStage({ flow }: { flow: number }) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<FlameField | null>(null);
  const [gl, setGl] = useState(hasWebGL2);
  const flowNow = useRef(flow);
  flowNow.current = flow;
  // the engine (and its GPU context) lives only while the stage is near the viewport
  const near = useNearViewport(host);

  useEffect(() => {
    const h = host.current;
    if (!gl || !h || !near) return;
    // a fresh canvas each time: a destroyed engine gives its GPU context back, so its canvas is never reused
    const cv = document.createElement("canvas");
    cv.setAttribute("aria-hidden", "true");
    h.appendChild(cv);
    try { engine.current = flameField({ host: h, canvas: cv, flow: flowNow.current }); } catch { engine.current = null; }
    // the engine could not start: show the drawn still instead of an empty frame
    if (!engine.current) { cv.remove(); setGl(false); return; }
    return () => { engine.current?.destroy(); engine.current = null; cv.remove(); };
    // flow changes go through setFlow below, not a new engine
  }, [gl, near]);
  useEffect(() => { engine.current?.setFlow(flow); }, [flow]);

  return (
    <figure className="flame-stage" data-element="flame-points">
      <div className="flame-canvas" ref={host} role="img" aria-label={`Illustration of a flame on a rod in orbit, ${describe(flow)}`}>
        {gl ? <span className="flame-rod" aria-hidden="true" /> : <FlameStill flow={flow} />}
      </div>
      <figcaption className="caption">
        Drawn, not measured. The slider is the fan.
      </figcaption>
    </figure>
  );
}

/** The same flame as a flat drawing, for browsers without WebGL 2. */
function FlameStill({ flow }: { flow: number }) {
  const len = 60 + 200 * flow;
  const h = 46 - 8 * flow;
  const x0 = 70;
  return (
    <svg viewBox="0 0 400 200" aria-hidden="true" className="flame-svg">
      <rect x="20" y="96" width="360" height="8" rx="4" style={{ fill: "var(--rod)" }} />
      <path d={`M ${x0} 100 C ${x0 + 10} ${100 - h}, ${x0 + len * 0.6} ${100 - h * 0.9}, ${x0 + len} 100 C ${x0 + len * 0.6} ${100 + h * 0.9}, ${x0 + 10} ${100 + h}, ${x0} 100 Z`}
        style={{ fill: "var(--flame-glow)", opacity: 0.25 + 0.35 * flow }} />
    </svg>
  );
}
