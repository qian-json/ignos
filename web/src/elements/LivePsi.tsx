// Written with AI assistance (Claude Code)
// "Live from NASA PSI": what NASA's archive reports for one investigation right now, read through our
// /api/psi proxy (NASA's API only allows its own origin). Fetched when a row is opened, once per page
// load. If NASA can't be reached it says so; it never shows a stored or made-up value in its place.
import { useEffect, useState } from "react";

interface Live {
  live: true;
  accession: string;
  files: number;
  total_bytes: number | null;
  newest_file: string | null;
  modified_date: string | null;
  license: string | null;
  publications: number;
  doi_url: string | null;
  fetched_at: string;
}
type State = { s: "loading" } | { s: "ok"; d: Live } | { s: "down"; reason: string };

const seen = new Map<string, Promise<State>>();

function load(accession: string): Promise<State> {
  let p = seen.get(accession);
  if (!p) {
    p = fetch(`/api/psi?id=${encodeURIComponent(accession)}`)
      .then((r) => r.json())
      .then((j: { live?: boolean; reason?: string } & Partial<Live>): State => (j.live ? { s: "ok", d: j as Live } : { s: "down", reason: j.reason ?? "unavailable" }))
      .catch((): State => ({ s: "down", reason: "could not reach our proxy" }));
    seen.set(accession, p);
  }
  return p;
}

const gb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(0)} MB`);
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export function LivePsi({ accession }: { accession: string }) {
  const [st, setSt] = useState<State>({ s: "loading" });
  useEffect(() => {
    let on = true;
    load(accession).then((v) => on && setSt(v));
    return () => {
      on = false;
    };
  }, [accession]);
  if (st.s === "loading") return <p className="live-psi is-loading" aria-live="polite"><span className="live-dot" aria-hidden="true" /> Asking NASA's PSI archive…</p>;
  if (st.s === "down") return <p className="live-psi is-down" aria-live="polite">NASA PSI live lookup unavailable ({st.reason}).</p>;
  const d = st.d;
  return (
    <p className="live-psi" aria-live="polite">
      <span className="live-dot" aria-hidden="true" /> <strong>Live from NASA PSI</strong>
      {" · "}{d.files} {d.files === 1 ? "file" : "files"}{d.total_bytes ? ` · ${gb(d.total_bytes)}` : ""}
      {d.newest_file ? ` · newest file ${day(d.newest_file)}` : ""}
      {d.license ? ` · ${d.license}` : ""}
      {d.publications ? ` · ${d.publications} publications` : ""}
      <span className="live-when"> · checked {time(d.fetched_at)}</span>
      {d.doi_url && <> · <a className="textlink" href={d.doi_url}>NASA record</a></>}
    </p>
  );
}
