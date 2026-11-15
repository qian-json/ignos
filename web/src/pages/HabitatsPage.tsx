// Written with AI assistance (Claude Code)
// Pick a habitat: NASA's fire investigations ranked for it, and the side-by-side compare.
import { HeadingRise } from "../elements/HeadingRise";
import { InvestigationDrum } from "../elements/InvestigationDrum";
import { Habitats } from "../panels/Habitats";

export function HabitatsPage() {
  return (
    <div className="page page-habitats">
      <div className="sheet">
        <InvestigationDrum />
        <Habitats />
        <HeadingRise />
      </div>
    </div>
  );
}
