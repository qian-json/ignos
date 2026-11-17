// Written with AI assistance (Claude Code)
// The opener of the Research page: real burn photos flow out of a ring of light toward the viewer, and the
// mouse pushes them aside. The cards are our own frames (burnCards.ts); the motion is burnFlowEngine.ts.
// Whatever you pass as children sits over the flow (the page's h1, its meta label); the stage takes the height
// of its CSS (default: one screen). It is decoration: the canvas is hidden from assistive tech, and the chip
// says what the pictures are and that the arrangement is an illustration.
// Reduced motion: one composed still. The Pause switch (<html data-motion="paused">) freezes it; it also stops
// off screen and in hidden tabs.
//
//   <BurnFlow><span className="t-meta">Research</span><h1 className="t-display-xl">...</h1></BurnFlow>
import { useEffect, useRef, type ReactNode } from "react";
import { makeBurnCards, CARD_SIZE } from "./burnCards";
import { createBurnFlow } from "./burnFlowEngine";
import { motionPaused, prefersReduced, watchMotion } from "./motionState";
import "./display-type.css";
import "./burn-flow.css";

export function BurnFlow({ children, className, id = "burn-flow" }: { children?: ReactNode; className?: string; id?: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const stage = stageRef.current, cv = canvasRef.current;
    if (!stage || !cv) return;
    let flow: ReturnType<typeof createBurnFlow> | null = null, gone = false, stopWatch = () => {};
    makeBurnCards().then((pictures) => {
      if (gone) return;
      const ground = getComputedStyle(stage).getPropertyValue("--bf-ground").trim() || "#f1f4f9";
      flow = createBurnFlow(stage, cv, {
        pictures, ground: /^#[0-9a-f]{3,6}$/i.test(ground) ? ground : "#f1f4f9",
        aspect: CARD_SIZE[0] / CARD_SIZE[1], texture: CARD_SIZE,
      });
      const sync = () => { flow?.setStill(prefersReduced()); flow?.setPaused(motionPaused()); };
      sync();
      stopWatch = watchMotion(sync);
    }).catch(() => {
      // the photos could not load: the stage keeps its plain ground and the heading over it, never an error
      if (!gone) stage.dataset.gl = "off";
    });
    return () => { gone = true; stopWatch(); flow?.destroy(); };
  }, []);

  return (
    <section ref={stageRef} className={`bf${className ? ` ${className}` : ""}`} data-element="burn-flow" id={id}>
      <canvas ref={canvasRef} className="bf-canvas" aria-hidden="true" />
      {children != null && <div className="bf-over">{children}</div>}
      <p className="bf-chip">NASA BASS-II photos</p>
    </section>
  );
}
