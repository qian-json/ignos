// Written with AI assistance (Claude Code)
// How we know: sources, the checker, and how every number was measured.
import { HeadingRise } from "../elements/HeadingRise";
import { ProofLayers } from "../elements/ProofLayers";
import { Method } from "../panels/Method";

export function MethodPage() {
  return (
    <div className="page page-method">
      <div className="sheet">
        <ProofLayers />
        <Method />
        <HeadingRise />
      </div>
    </div>
  );
}
