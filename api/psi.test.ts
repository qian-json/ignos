// Written with AI assistance (Claude Code)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PSI_ACCESSIONS, handlePsi } from "./psi.js";

const req = (id: string) => new Request(`https://ignos.earth/api/psi?id=${encodeURIComponent(id)}`);
const RECORD = {
  accession: "PSI-25",
  investigationAcronym: "BASS-II",
  title: "Burning and Suppression of Solids - II",
  doi: "10.60555/4qc4-de67",
  licenseIdentifier: "CC0-1.0",
  managingNasaCenter: "Glenn Research Center (GRC)",
  flightProgram: "International Space Station (ISS)",
  releaseDate: "31-Dec-2022",
  modifiedDate: "24-Nov-2025",
  totalFileSize: 274_630_000_000,
  publications: [{}, {}, {}],
  contacts: [{ email: "someone@nasa.gov", firstName: "Some", lastName: "One" }],
  added: [
    { file_name: "a.zip", file_size: 10, date_created: { $date: Date.UTC(2025, 10, 24) } },
    { file_name: "b.mp4", file_size: 20, date_created: { $date: Date.UTC(2024, 0, 2) } },
  ],
};
const fake = (reply: () => Response | Promise<Response>) => {
  const calls: string[] = [];
  const fetch = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return reply();
  }) as typeof globalThis.fetch;
  return { fetch, calls };
};

describe("GET /api/psi", () => {
  it("allows exactly the 24 investigations in psi_conditions.json", () => {
    const doc = JSON.parse(readFileSync(new URL("../data/derived/psi_conditions.json", import.meta.url), "utf8"));
    expect([...PSI_ACCESSIONS]).toEqual(doc.conditions.map((c: { accession: string }) => c.accession));
  });

  it("refuses any other id without calling NASA", async () => {
    for (const bad of ["PSI-999", "psi-25/../x", "https://evil.example", ""]) {
      const net = fake(() => Response.json(RECORD));
      const res = await handlePsi(req(bad), { fetch: net.fetch });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { live: boolean }).live).toBe(false);
      expect(net.calls).toHaveLength(0);
    }
  });

  it("returns a small public summary, cached by the CDN, and never the contacts", async () => {
    const net = fake(() => Response.json(RECORD));
    const res = await handlePsi(req("psi-25"), { fetch: net.fetch, now: () => new Date("2026-11-16T00:00:00Z") });
    expect(net.calls).toEqual(["https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-25"]);
    expect(res.headers.get("cache-control")).toContain("s-maxage=3600");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      live: true, accession: "PSI-25", acronym: "BASS-II", files: 2, total_bytes: 274_630_000_000, publications: 3,
      newest_file: "2025-11-24T00:00:00.000Z", license: "CC0-1.0", doi_url: "https://doi.org/10.60555/4qc4-de67",
    });
    expect(JSON.stringify(body)).not.toMatch(/someone|nasa\.gov"|email/);
  });

  it("says live:false (never invents) when NASA fails, times out, sends garbage or the wrong record", async () => {
    const cases: (() => Response | Promise<Response>)[] = [
      () => new Response("down", { status: 503 }),
      () => new Response("not json"),
      () => Response.json({ ...RECORD, accession: "PSI-26" }),
      () => {
        throw new TypeError("fetch failed");
      },
    ];
    for (const reply of cases) {
      const res = await handlePsi(req("PSI-25"), { fetch: fake(reply).fetch });
      const body = (await res.json()) as { live: boolean; reason: string };
      expect(body.live).toBe(false);
      expect(body.reason).toMatch(/NASA PSI/);
      expect(res.headers.get("cache-control")).toBe("public, s-maxage=60");
    }
  });
});
