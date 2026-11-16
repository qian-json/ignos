// Written with AI assistance (Claude Code)
// How we know: sources, the checker, and how every number was measured.
import { lazy, Suspense } from "react";
import { HeadingRise } from "../elements/HeadingRise";
import { ProofLayers } from "../elements/ProofLayers";
import { Method } from "../panels/Method";

// an illustration (Earth teardrop beside the microgravity sphere); it and three.js load in their own chunks
const FreefallFlames = lazy(() => import("../three/FreefallFlames").then((m) => ({ default: m.FreefallFlames })));

export function MethodPage() {
  return (
    <div className="page page-method">
      <div className="sheet">
        <ProofLayers />
        <section className="panel" id="flame-in-freefall" aria-labelledby="ff-h">
          <div className="panel-head">
            <h2 id="ff-h">Flame in freefall</h2>
            <p>On Earth, hot gas rises and pulls a candle flame up into a teardrop. In still air in orbit nothing rises, so oxygen reaches the flame only by diffusion.</p>
          </div>
          <Suspense fallback={<div style={{ aspectRatio: "16 / 8", minHeight: 280, borderRadius: "var(--radius)", background: "var(--night)" }} />}>
            <FreefallFlames />
          </Suspense>
        </section>
        <Method />
        <HeadingRise />
      </div>
    </div>
  );
}
