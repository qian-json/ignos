// Written with AI assistance (Claude Code)
// The overview band under the opening scene: the headline numbers, computed from the data files.
// The burn replay and the edge chart, in sync, sit behind the details toggle.
import { EdgeChart } from "../EdgeChart";
import { Num } from "../Num";
import { FACTS, MOONGAP_FILE, SPREAD_FILE, cell, fmt, median, moongap, spread, validated } from "../data";
import { TESTS } from "../panels/Measure";
import { useReplay } from "../replay";
import { BurnReplay } from "../three/BurnReplay";
import { More } from "../ui/More";
import { Rolling, RollingRow } from "../elements/StatOdometer";

const OK = spread.filter(validated);
const OK_TESTS = [...new Set(OK.map((r) => r.test_id))];

export function Facts({ rail = false }: { rail?: boolean }) {
  const worst = OK.reduce((a, b) => (Math.abs(Number(b.pct_error)) > Math.abs(Number(a.pct_error)) ? b : a));
  const med = median(OK.map((r) => Math.abs(Number(r.pct_error))));
  return (
    <RollingRow className={rail ? "facts rail" : "facts"}>
      <div className="fact"><dt className="k">Low-flow steps validated in {OK_TESTS.length} NASA tests</dt><dd className="v num"><Rolling text={String(OK.length)} /></dd></div>
      <div className="fact"><dt className="k">Median difference from published rates, low airflow; worst <Num source={cell(SPREAD_FILE, worst._row, "pct_error")}>{Math.abs(Number(worst.pct_error))}%</Num></dt><dd className="v num"><Rolling text={`${fmt(med, 1)}%`} /></dd></div>
      <div className="fact"><dt className="k">Materials ranked by Moon Gap</dt><dd className="v num"><Rolling text={String(moongap.ranking.length)} /></dd></div>
      <div className="fact"><dt className="k">Checkable numbers behind AI answers</dt><dd className="v num"><Rolling text={String(FACTS.length)} /></dd></div>
    </RollingRow>
  );
}

function TestPicker() {
  const { test, setTest } = useReplay();
  return (
    <div className="seg small" role="group" aria-label="Choose a test">
      {/* phones drop the word "Test" so all the tests fit on one row (the label keeps it) */}
      {TESTS.map((t) => <button key={t} type="button" aria-label={`Test ${t}`} aria-pressed={t === test} onClick={() => setTest(t)}><span className="seg-pre">Test </span>{t}</button>)}
    </div>
  );
}

/** The first dashboard screen: headline numbers; the replay and the edge chart behind the toggle. */
export function Overview() {
  const { test, cursor, setCursor } = useReplay();
  return (
    <section className="overview" id="overview" aria-labelledby="overview-h">
      <div className="panel-head">
        <h2 id="overview-h" className="t-display-l">Flame spread rate: our measurements against NASA's</h2>
        <p>Each number links to its source file, row and column.</p>
      </div>
      <Facts />
      <More summary="Details">
        <div className="ov-grid">
          <div className="card strong">
            <div className="subject-bar"><h3>Replay the burn</h3><TestPicker /></div>
            <BurnReplay test={test} onTime={setCursor} compact />
          </div>
          <div className="card">
            <h3>Leading edge in every photo</h3>
            <EdgeChart test={test} cursor={cursor} />
            <p className="caption">Red line: replay time. Dots: the leading edge in each NASA photo. Blue steps: the fitted rate at each opposed-flow setting.</p>
          </div>
        </div>
        <p className="caption">Validated tests: {OK_TESTS.join(", ")}. The Moon Gap ranking comes from <Num source={cell(MOONGAP_FILE, 0, "paper")}>{/ICES-\d{4}-\d+/.exec(moongap.paper)?.[0] ?? moongap.paper}</Num>.</p>
      </More>
    </section>
  );
}
