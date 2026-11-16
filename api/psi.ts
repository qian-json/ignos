// Written with AI assistance (Claude Code)
// GET /api/psi?id=PSI-25: a live summary of one investigation, read from NASA's Physical Sciences
// Informatics (PSI) archive at request time, so the site shows what NASA's archive reports right now.
//
// Why a proxy: NASA's PSI API answers JSON but only allows its own origin (CORS), so a browser on our
// site cannot call it directly. This function calls it server-side and returns a small public summary.
//
// Rules:
//   - Only the 24 investigations in data/derived/psi_conditions.json are allowed (a test keeps the list
//     in step); any other id is refused, so this cannot be used to fetch arbitrary URLs.
//   - Only public archive facts are returned (title, licence, file count and size, dates, DOI). The
//     record's contact list (names, emails) is never forwarded.
//   - On any failure the answer is { live: false } with a reason; nothing is ever invented or cached
//     from our own data in its place.
//   - The CDN caches a good answer for an hour (and serves it stale for a day while refreshing), so
//     NASA's server is called rarely.
// This file is an endpoint; files starting with "_" are not.

export const PSI_ACCESSIONS = [
  "PSI-10", "PSI-20", "PSI-21", "PSI-22", "PSI-23", "PSI-25", "PSI-26", "PSI-39", "PSI-47", "PSI-60", "PSI-62", "PSI-68",
  "PSI-69", "PSI-98", "PSI-99", "PSI-100", "PSI-101", "PSI-102", "PSI-106", "PSI-107", "PSI-115", "PSI-117", "PSI-142", "PSI-159",
] as const;

const PSI_API = "https://psi.nasa.gov/geode-py/ws/repo/investigations/";
const TIMEOUT_MS = 6000;
const MAX_BYTES = 20_000_000;
const CACHE_OK = "public, s-maxage=3600, stale-while-revalidate=86400";
const CACHE_FAIL = "public, s-maxage=60";

export interface PsiLive {
  live: true;
  accession: string;
  acronym: string | null;
  title: string | null;
  files: number;
  total_bytes: number | null;
  newest_file: string | null;
  release_date: string | null;
  modified_date: string | null;
  license: string | null;
  managing_center: string | null;
  flight_program: string | null;
  publications: number;
  doi: string | null;
  doi_url: string | null;
  source: string;
  fetched_at: string;
}
export interface PsiDown {
  live: false;
  accession: string | null;
  reason: string;
}

export interface PsiDeps {
  fetch?: typeof fetch;
  now?: () => Date;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** The public summary of one PSI record (exported for tests). */
export function summarize(accession: string, rec: Record<string, unknown>, now: Date): PsiLive {
  const added = Array.isArray(rec.added) ? (rec.added as Record<string, unknown>[]) : [];
  const sizes = added.map((f) => (typeof f.file_size === "number" ? f.file_size : 0));
  const total = typeof rec.totalFileSize === "number" ? rec.totalFileSize : sizes.length ? sizes.reduce((a, b) => a + b, 0) : null;
  const dates = added
    .map((f) => (f.date_created as { $date?: unknown } | undefined)?.$date)
    .filter((d): d is number => typeof d === "number");
  const doi = str(rec.doi);
  return {
    live: true,
    accession,
    acronym: str(rec.investigationAcronym),
    title: str(rec.title),
    files: added.length,
    total_bytes: total,
    newest_file: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
    release_date: str(rec.releaseDate),
    modified_date: str(rec.modifiedDate),
    license: str(rec.licenseIdentifier) ?? str(rec.licenseName),
    managing_center: str(rec.managingNasaCenter),
    flight_program: str(rec.flightProgram),
    publications: Array.isArray(rec.publications) ? rec.publications.length : 0,
    doi,
    doi_url: doi ? `https://doi.org/${doi}` : null,
    source: `${PSI_API}${accession}`,
    fetched_at: now.toISOString(),
  };
}

function down(accession: string | null, reason: string, status = 200): Response {
  const body: PsiDown = { live: false, accession, reason };
  return Response.json(body, { status, headers: { "cache-control": CACHE_FAIL } });
}

export async function handlePsi(request: Request, deps: PsiDeps = {}): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id")?.trim().toUpperCase() ?? "";
  if (!(PSI_ACCESSIONS as readonly string[]).includes(id)) return down(null, "unknown investigation id", 400);
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), TIMEOUT_MS);
  try {
    const res = await (deps.fetch ?? fetch)(`${PSI_API}${id}`, { headers: { accept: "application/json" }, signal: deadline.signal });
    if (!res.ok) return down(id, `NASA PSI answered ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_BYTES) return down(id, "NASA PSI record too large");
    const rec = JSON.parse(text) as Record<string, unknown>;
    if (rec?.accession !== id) return down(id, "NASA PSI returned a different record");
    return Response.json(summarize(id, rec, (deps.now ?? (() => new Date()))()), { headers: { "cache-control": CACHE_OK } });
  } catch (e) {
    return down(id, deadline.signal.aborted ? "NASA PSI did not answer in time" : e instanceof SyntaxError ? "NASA PSI reply was not JSON" : "NASA PSI could not be reached");
  } finally {
    clearTimeout(timer);
  }
}

export function GET(request: Request): Promise<Response> {
  return handlePsi(request);
}
