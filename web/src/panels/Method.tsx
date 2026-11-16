// Written with AI assistance (Claude Code)
import type { NumberSource } from "@still-air/proof";
import { FACT_FILES, SPREAD_FILE, spread } from "../data";
import { Num } from "../Num";
import { FactMosaic } from "../elements/FactMosaic";
import { CheckerStory } from "../elements/CheckerStory";
import { More } from "../ui/More";
import { FileLeaders } from "../elements/FileLeaders";
import { ChecksumDecode } from "../elements/ChecksumDecode";
import { SourcesSettle } from "../elements/SourcesSettle";
import { CheckSentence } from "./Ask";
import evalSummary from "../generated/ask_eval.json";

interface Graded { answerable: number; correct: number; partial: number; wrong: number; wrong_abstain: number; unanswerable: number; correct_abstain: number; moon_airflow_numbers: number }
interface EvalRun { run: string; commit: string | null; questions: number; answered: number; abstained: number; then: { checked: number; verified: number }; now: { checked: number; verified: number }; graded: Graded | null }
const EVAL = evalSummary as { source: { file: string; sha256: string; model: string | null } | null; runs: EvalRun[] };
const RUN_NAMES: Record<string, string> = { hybrid: "What ships: keyword and meaning search", keyword: "Keyword search only", closed_book: "The same model with no sources (a plain chatbot)" };
/** Provenance for a count taken over a recorded eval run. */
const counted = (run: string, what: string): NumberSource => ({ file: EVAL.source!.file, row: 0, column: `${run}.results`, sha256: EVAL.source!.sha256, derived: `${what}, counted by scripts/regate-eval.mjs` });
/** Provenance for a grade count stored in the run's summary. */
const grade = (run: string, key: string): NumberSource => ({ file: EVAL.source!.file, row: 0, column: `${run}.summary.${key}`, sha256: EVAL.source!.sha256 });

// PSI photo sets behind the tests in spread_rates.csv (sample B16 is photo set P16, and so on)
const PHOTO_SETS = [...new Set(spread.map((r) => `P${r.test_id.slice(1)}`))].sort();
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

const SOURCES = [
  { name: "NASA Physical Sciences Informatics, BASS-II (PSI-25)", what: `Raw space-station photos of tests ${list(PHOTO_SETS)}, test logs, fan calibration`, href: "https://doi.org/10.60555/4qc4-de67" },
  { name: "Link, Huang, Fernandez-Pello, Olson, Ferkul (2018), Scientific Reports 8:120, and its supplement", what: "Table S1: NASA's published spread rates; Fig. S1: edge positions", href: "https://doi.org/10.1038/s41598-017-18398-4" },
  { name: "Urban, Olson, Dietrich et al., ICES-2025-392", what: "Earth (White Sands) and lunar-gravity oxygen limits, Figs. 7–12 and Table 2", href: "https://ntrs.nasa.gov/citations/20250002114" },
  { name: "Ferkul et al., LPSC 2026 (FM2)", what: "What NASA's planned Moon flammability experiment will measure", href: "https://ntrs.nasa.gov/citations/20260001966" },
];

/** How we know: one line and the fact mosaic up front, everything else in closed sections. */
export function Method() {
  const spreadSha = FACT_FILES.find((f) => f.file === SPREAD_FILE)?.sha256;
  const graded = EVAL.source && EVAL.runs.some((r) => r.graded);
  return (
    <section className="panel method" id="method" aria-labelledby="method-h">
      <div className="article">
        <h2 id="method-h" className="t-display-l">Methods and sources</h2>
        <p>Every number traces to its file, row and column, or a paper page.</p>
        <FactMosaic />

        <div className="method-more">
          <More summary="Sources">
            <SourcesSettle className="sources">
              {SOURCES.map((x) => (
                <li key={x.href}>
                  <a href={x.href}>{x.name}</a>
                  <span className="caption">{x.what}</span>
                </li>
              ))}
            </SourcesSettle>
          </More>

          <More summary="Measurement, files and data">
            <h3>Measuring the flames</h3>
            <p>We decoded NASA's raw camera files, corrected each photo for its own exposure, found the flame's leading edge along the rod, and calibrated millimetres on the rod's own width. One straight-line fit per fan setting gives the spread rate, with a 95% interval. Steps with a jittery edge are marked low confidence and are never quoted as validated.</p>
            <p className="caption">No machine learning: a brightness threshold relative to each frame, a morphological clean-up, and the front-most flame pixel per row.</p>
            <h3>A unit label error in Table S1</h3>
            <p>Table S1 labels half its spread rates in cm/s and the other half in mm/s. Read literally, our space-station flames would be ten times faster than NASA's. The paper's edge plots, and our own measurement from the raw photos, both say both halves are cm/s. We use that one rule, in one place in the code, and say so here.</p>
            <p className="caption">Checked three ways: the supplement's text, the word positions on the PDF page, and a rendered image of the table.</p>
            <h3>The files</h3>
            <p className="caption" id="facts-cap">The facts behind the checker, per file</p>
            <FileLeaders labelledBy="facts-cap" />
            <p className="caption">Tracker code: <code>pipeline/</code>. Measured spread rates: <code>{SPREAD_FILE}</code>{spreadSha ? <>, sha256 <ChecksumDecode hash={spreadSha} /></> : "."}</p>
          </More>

          <More summary="One number, checked">
            <p>A build step turns every data file into checkable facts, each stamped with its file, row, column and checksum, plus published numbers quoted word for word with paper and page. The AI's answers are checked against them before they're shown, matching units and the precision written. Anything unmatched is flagged, never passed.</p>
            <CheckerStory />
          </More>

          <More summary="Check any sentence">
            <CheckSentence />
          </More>

          {graded && EVAL.source && (
            <More summary="The AI, tested three ways">
              <p>We asked the team's question set through the real Ask endpoint, some with no answer in our data, and graded every reply against the expected answer: two graders that couldn't see each other's grades, and a third where they disagreed. Then we asked the same questions of the same model with no sources and no rules, a plain chatbot.</p>
              <div className="scroll-x" role="region" aria-labelledby="eval-cap" tabIndex={0}>
                <table className="data eval-table">
                  <caption id="eval-cap">The same questions, three ways{EVAL.source.model ? `, ${EVAL.source.model}` : ""}</caption>
                  <thead><tr><th scope="col">Setup</th><th scope="col" className="r">Right</th><th scope="col" className="r">Partly right</th><th scope="col" className="r">Wrong</th><th scope="col" className="r">Wrongly said “not in our data”</th><th scope="col" className="r">Unanswerable, declined</th><th scope="col" className="r">Moon airflow numbers invented</th><th scope="col" className="r">Numbers verified</th></tr></thead>
                  <tbody>
                    {EVAL.runs.filter((r) => r.graded).map((r) => {
                      const g = r.graded!;
                      return (
                        <tr key={r.run}>
                          <td>{RUN_NAMES[r.run] ?? r.run}</td>
                          <td className="r num"><Num source={grade(r.run, "correct")}>{g.correct} of {g.answerable}</Num></td>
                          <td className="r num"><Num source={grade(r.run, "partial")}>{g.partial}</Num></td>
                          <td className="r num"><Num source={grade(r.run, "wrong")}>{g.wrong}</Num></td>
                          <td className="r num"><Num source={grade(r.run, "wrong_abstain")}>{g.wrong_abstain}</Num></td>
                          <td className="r num"><Num source={grade(r.run, "correct_abstain")}>{g.correct_abstain} of {g.unanswerable}</Num></td>
                          <td className="r num"><Num source={grade(r.run, "moon_airflow_numbers")}>{g.moon_airflow_numbers}</Num></td>
                          <td className="r num"><Num source={counted(r.run, "the recorded answers re-checked by the current proof layer")}>{r.now.verified} of {r.now.checked}</Num></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="caption">Graded by Claude, not by the model that answered. “Numbers verified” means the checker matched a number to a cited fact; the plain chatbot cites nothing, so its numbers are checked against everything. Every reply and grade: <code>{EVAL.source.file}</code>.</p>
            </More>
          )}

          <More summary="Limits, and where AI was used">
            <ul className="claims">
              <li>We don't know the airflow around a flame on the Moon, and nobody has measured it. We never put a number on it.</li>
              <li>NASA has not concluded that turning off the fans fails on the Moon. The Moon Gap is our reading of NASA's data.</li>
              <li>NASA's scientists measured these spread rates first. What's new is an open, repeatable way to re-measure them from the raw photos, check them, and question them.</li>
            </ul>
            <h3>Where AI was used</h3>
            <p>The project framing and the flame-model idea came from conversations with Claude (Anthropic), and Claude wrote much of the code with us and helped read and check the source papers. OpenAI's Codex also reviewed and edited parts of the repository. Google Gemini answers questions in the Ask panel, from passages of our data and the papers that code retrieves first. Code computes every measurement and ranking; the model only writes sentences, and its numbers pass the checker. Figures were read from the ICES paper by image analysis we wrote and checked by overlay. No image on this site was AI-generated: the opening film is a Blender render we built, labelled Illustration, and the photos are NASA's.</p>
            <p className="caption">The opening scene is drawn in code. Only the rod's width, the flame's length and the airflow in it are data.</p>
          </More>
        </div>
      </div>
    </section>
  );
}
