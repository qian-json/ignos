// Written with AI assistance (Claude Code)
// The deep dives: what we measured ourselves (the overview figures, Measure, In orbit) and the Moon
// Gap. It opens on the flow of burn photos with the page's heading over it, then a band of burn frames
// that bends with the scroll. The sections keep their
// anchors (#measure, #orbit, #moon), so old links land on them.
import { BurnFlow } from "../elements/BurnFlow";
import { HeadingRise } from "../elements/HeadingRise";
import { PaperStrip } from "../elements/PaperStrip";
import { SlotTitle } from "../elements/SlotTitle";
import { Overview } from "../hero/Overview";
import { Measure } from "../panels/Measure";
import { MoonGap } from "../panels/MoonGap";
import { Orbit } from "../panels/Orbit";

export function ResearchPage() {
  return (
    <div className="page page-research">
      <BurnFlow>
        <SlotTitle as="h1" meta="Research" id="research-title" className="t-display-xl">What we measured ourselves</SlotTitle>
        <p className="t-lede bf-lede">Flame spread read from raw space-station photos, and Moon versus Earth oxygen limits.</p>
      </BurnFlow>
      <PaperStrip />
      <div className="sheet">
        <Overview />
        <Measure />
        <Orbit />
        <MoonGap />
        <HeadingRise />
      </div>
    </div>
  );
}
