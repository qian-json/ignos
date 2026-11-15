// Written with AI assistance (Claude Code)
import { describe, expect, it } from "vitest";
import { PROOF_LAYER_VERSION, gateAnswer, proofLayerStatus } from "./index.js";

describe("proof layer", () => {
  it("exports a version, reports ready, and exposes gateAnswer", () => {
    expect(PROOF_LAYER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(proofLayerStatus()).toBe("ready");
    expect(typeof gateAnswer).toBe("function");
  });
});
