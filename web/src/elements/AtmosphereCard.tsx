// Written with AI assistance (Claude Code)
// Habitat atmospheres (oxygen % against total pressure) next to NASA's lunar-gravity flammability limits.
// Every number is read from data/reference/habitat_atmospheres.json (quoted sources, tested) and the Moon
// Gap file; none is typed here. Context, not a design value: the limits come from short drop tests.
import { MATERIAL_NAMES, atmospheres, moongap } from "../data";

type Key = "o2_pct" | "pressure_psi" | "o2_pct_at_least" | "pressure_psi_at_most";
/** A number from the atmospheres file; a missing one is a data error, not something to guess. */
function need(id: string, k: Key): number {
  const v = atmospheres.atmospheres.find((a) => a.id === id)?.[k];
  if (typeof v !== "number") throw new Error(`habitat_atmospheres.json: ${id}.${k} missing`);
  return v;
}
const label = (id: string) => atmospheres.atmospheres.find((a) => a.id === id)?.label ?? id;

const W = 600, H = 300, L = 46, R = 14, T = 14, B = 40;
const X_MAX = 16, Y_MAX = 100;
const x = (psi: number) => L + (psi / X_MAX) * (W - L - R);
const y = (pct: number) => T + (1 - pct / Y_MAX) * (H - T - B);

export function AtmosphereCard() {
  const moonO2 = need("moon_base", "o2_pct_at_least"), moonP = need("moon_base", "pressure_psi_at_most"), icesP = need("ices_tests", "pressure_psi");
  const pts = [
    { id: "earth", o2: need("earth", "o2_pct"), p: need("earth", "pressure_psi"), c: "var(--earth)", left: true, dy: -10 },
    { id: "spacesuit", o2: need("spacesuit", "o2_pct"), p: need("spacesuit", "pressure_psi"), c: "var(--ink)", left: false, dy: 16 },
    { id: "fm2_test", o2: need("fm2_test", "o2_pct"), p: need("fm2_test", "pressure_psi"), c: "var(--flame)", left: false, dy: -8 },
  ];
  const limits = Object.entries(moongap.materials)
    .map(([k, m]) => [k, m.status === "ok" ? (m as { lunar?: { limit_pct?: number } }).lunar?.limit_pct : undefined] as const)
    .filter((e): e is readonly [string, number] => typeof e[1] === "number");
  const topRaw = Math.max(...limits.map(([, v]) => v));
  const top = Number(topRaw.toFixed(1)); // shown as the Moon Gap shows lunar limits
  const earth = pts[0], suit = pts[1];
  const excluded = Object.values(moongap.materials).filter((m) => m.status !== "ok").length;
  // the challenge page's sentence on the Moon-base oxygen, quoted from the atmospheres file
  const context = atmospheres.atmospheres.find((a) => a.id === "moon_base")?.quotes.find((q) => q.for === "context")?.text;
  return (
    <figure className="atm card" aria-labelledby="atm-h">
      <h3 id="atm-h">Habitat air against NASA's lunar-gravity limits</h3>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Oxygen percent against pressure. Planned Moon base: ${moonO2}% oxygen or more at ${moonP} psi or less. Earth air ${earth.o2}% at ${earth.p} psi; spacesuit ${suit.o2}% at ${suit.p} psi. NASA's lunar-gravity limits for ${limits.length} materials, all at or below ${top}% at ${icesP} psi.`}>
        {[0, 4, 8, 12, 16].map((p) => <g key={p}><line x1={x(p)} x2={x(p)} y1={T} y2={H - B} className="atm-grid" /><text x={x(p)} y={H - B + 16} className="atm-tick" textAnchor="middle">{p}</text></g>)}
        {[0, 25, 50, 75, 100].map((p) => <g key={p}><line x1={L} x2={W - R} y1={y(p)} y2={y(p)} className="atm-grid" /><text x={L - 6} y={y(p) + 4} className="atm-tick" textAnchor="end">{p}%</text></g>)}
        <text x={(L + W - R) / 2} y={H - 6} className="atm-axis" textAnchor="middle">total pressure (psi)</text>
        <rect x={x(0)} y={y(Y_MAX)} width={x(moonP) - x(0)} height={y(moonO2) - y(Y_MAX)} className="atm-moon" />
        <text x={x(0) + 8} y={y((moonO2 + Y_MAX) / 2)} className="atm-label atm-moon-label">{label("moon_base")}:</text>
        <text x={x(0) + 8} y={y((moonO2 + Y_MAX) / 2) + 15} className="atm-label atm-moon-label">{moonO2}% O2 or more, {moonP} psi or less</text>
        {limits.map(([k, v]) => <line key={k} x1={x(icesP) - 9} x2={x(icesP) + 9} y1={y(v)} y2={y(v)} className="atm-limit"><title>{`${MATERIAL_NAMES[k] ?? k}: lunar-gravity limit ${v.toFixed(1)}% O2 (ICES-2025-392)`}</title></line>)}
        <text x={x(icesP) - 14} y={y(topRaw) + 4} className="atm-label atm-limit-label" textAnchor="end">Lunar-gravity limits, {limits.length} materials</text>
        {pts.map((a) => (
          <g key={a.id}>
            <circle cx={x(a.p)} cy={y(a.o2)} r={5} fill={a.c} />
            <text x={x(a.p) + (a.left ? -8 : 8)} y={y(a.o2) + a.dy} className="atm-label" textAnchor={a.left ? "end" : "start"}>{label(a.id)}</text>
          </g>
        ))}
      </svg>
      <ul className="atm-legend">
        {pts.map((a) => <li key={a.id}><span className="atm-dot" style={{ background: a.c }} />{label(a.id)}: {a.o2}% O2 at {a.p} psi</li>)}
        <li><span className="atm-dot atm-dot-moon" />{label("moon_base")}: {moonO2}% O2 or more at {moonP} psi or less</li>
        <li><span className="atm-dot atm-dot-limit" />NASA lunar-gravity limits, {limits.length} materials: up to {top}% O2 at {icesP} psi</li>
      </ul>
      <figcaption className="caption">
        The lunar-gravity limits we read from NASA's ICES-2025-392 figures for {limits.length} materials{excluded > 0 && <> ({excluded} more excluded; see the Moon Gap)</>}, highest {top}% O2, all sit below the planned Moon-base air ({moonO2}% or more), so all of them burned in air that rich at lunar gravity.{context && <> The challenge page: “{context}”</>} {moongap.caveats[0]} Context, not a design value. Sources: the challenge page, the FM2 slides (p. {atmospheres.sources.fm2_2026?.page}) and ICES-2025-392.
      </figcaption>
    </figure>
  );
}
