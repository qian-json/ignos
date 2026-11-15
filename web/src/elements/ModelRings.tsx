// Written with AI assistance (Claude Code)
// Model page header art: burn photos set on three slowly turning concentric rings over an electric-blue
// field. Pure CSS 3D, decorative only. Reduced motion and the Pause switch hold the rings still.
import type { CSSProperties } from "react";
import "./model-rings.css";

const RAW = ["036", "071", "106"].map((n) => `/frames/B16/photo-${n}-raw.jpg`);
const SHEETS = ["B12", "B13a", "B13b", "B16", "B19", "P17"].map((t) => `/frames/${t}/sheet.jpg`);
const POOL = [...RAW, ...SHEETS];
const RINGS = [
  { n: 9, off: 0 },
  { n: 11, off: 3 },
  { n: 9, off: 6 },
];

export function ModelRings() {
  return (
    <div className="mrg" aria-hidden="true">
      <div className="mrg-stage">
        <div className="mrg-tilt">
          {RINGS.map((r, ri) => (
            <div key={ri} className={`mrg-ring mrg-ring-${ri}`} style={{ "--n": r.n } as CSSProperties}>
              <span className="mrg-line" />
              {Array.from({ length: r.n }, (_, i) => {
                const src = POOL[(i + r.off) % POOL.length];
                const pos = `${(i * 37 + ri * 23) % 100}% ${(i * 53 + ri * 41) % 100}%`;
                return (
                  <span key={i} className="mrg-card" style={{ "--i": i } as CSSProperties}>
                    <img src={src} alt="" loading="lazy" decoding="async" draggable={false} style={{ objectPosition: pos }} />
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
