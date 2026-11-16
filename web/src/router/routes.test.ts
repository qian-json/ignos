// Written with AI assistance (Claude Code)
// A link with a malformed escape ("/#100%") must not throw: the router decodes every hash at load.
import { describe, expect, it } from "vitest";
import { safeDecode, upgradeLegacy } from "./routes";

describe("safeDecode", () => {
  it("decodes a well-formed escape", () => {
    expect(safeDecode("ch%2Dopen")).toBe("ch-open");
    expect(safeDecode("measure")).toBe("measure");
  });

  it("keeps a malformed escape as typed instead of throwing", () => {
    expect(() => decodeURIComponent("100%")).toThrow(URIError);
    expect(safeDecode("100%")).toBe("100%");
    expect(safeDecode("%E0%A4%A")).toBe("%E0%A4%A");
  });
});

describe("upgradeLegacy", () => {
  it("leaves a home link with a malformed hash alone", () => {
    expect(upgradeLegacy(new URL("https://example.org/#100%"))).toBeNull();
  });

  it("still moves an old one-page section link to its page", () => {
    expect(upgradeLegacy(new URL("https://example.org/#measure"))?.href).toBe("https://example.org/research#measure");
  });
});
