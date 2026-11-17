// Written with AI assistance (Claude Code)
// The close: one thing said, one way to act, then the facts. The card is lit from its top edge by
// the flame's blue, three shapes stacked dark to light toward that edge under one blur, so the
// light agrees with the opening scene's flame.
import { FACTS, FACT_FILES, spread } from "../data";
import { AirWordmark } from "../elements/AirWordmark";

export function Close() {
  const files = FACT_FILES.filter((f) => f.facts > 0).length;
  const tests = new Set(spread.map((r) => r.test_id)).size;
  return (
    <section className="close" aria-labelledby="close-h">
      <div className="close-card">
        <svg className="close-light" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <filter id="close-blur" x="-20%" y="-50%" width="140%" height="200%" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </defs>
          <g filter="url(#close-blur)">
            <path d="M-10 -6 H110 V14 C80 22 20 22 -10 14 Z" style={{ fill: "var(--night-2)" }} />
            <path d="M5 -6 H95 V7 C72 13 28 13 5 7 Z" style={{ fill: "var(--flame)" }} />
            <path d="M25 -6 H75 V1.5 C62 4 38 4 25 1.5 Z" style={{ fill: "var(--pay)" }} />
          </g>
        </svg>
        <div className="close-body">
          <h2 id="close-h">Every number on this page opens to its file, row and column.</h2>
          <p>Click any dotted number for its source. Then ask a question and watch each number in the answer get checked.</p>
          <a className="btn primary" href="/ask">Try the checker</a>
          <dl className="close-facts">
            <div><dt>Checkable numbers</dt><dd className="num">{FACTS.length}</dd></div>
            <div><dt>Source files behind the checker</dt><dd className="num">{files}</dd></div>
            <div><dt>Space-station tests re-measured</dt><dd className="num">{tests}</dd></div>
          </dl>
        </div>
        <AirWordmark />
      </div>
    </section>
  );
}
