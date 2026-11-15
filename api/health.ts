import { PROOF_LAYER_VERSION } from "@still-air/proof";
import { buildInfo } from "./_build-info.js";

// GET /api/health: liveness plus what this deployment was built from.
export function GET(): Response {
  return Response.json(
    {
      ok: true,
      commit: buildInfo.commit,
      dataFiles: buildInfo.dataFiles,
      proof: PROOF_LAYER_VERSION,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
