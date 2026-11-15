import { describe, expect, it } from "vitest";
import { buildInfo } from "./_build-info.js";
import { GET } from "./health.js";

describe("GET /api/health", () => {
  it("returns ok, the build commit and the data file list", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; commit: string; dataFiles: unknown };
    expect(body.ok).toBe(true);
    expect(body.commit).toBe(buildInfo.commit);
    expect(body.commit).toMatch(/^([0-9a-f]{40}|unknown)$/);
    expect(Array.isArray(body.dataFiles)).toBe(true);
  });
});
