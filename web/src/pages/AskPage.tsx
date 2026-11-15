// Written with AI assistance (Claude Code)
// Ask NASA's fire data. Questions typed in the top bar on any page arrive here.
import { HeadingRise } from "../elements/HeadingRise";
import { FlameGlyphs } from "../elements/FlameGlyphs";
import { Ask } from "../panels/Ask";

export function AskPage() {
  return (
    <div className="page page-ask">
      <div className="sheet">
        <FlameGlyphs />
        <Ask />
        <HeadingRise />
      </div>
    </div>
  );
}
