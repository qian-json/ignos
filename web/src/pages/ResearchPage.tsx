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
        <figure className="space-time card">
          <img src="/visuals/headline_tests_space_time_2x2.jpg" alt="Four panels, one per headline test (B16, B19, B12, P17): every NASA photo stacked in time, a bright diagonal band that turns from yellow to blue, with the tracked flame edge" width={1920} height={1200} loading="lazy" />
          <figcaption className="caption">The four tests behind the low-airflow headline (B16, B19, B12, P17), every NASA photo stacked in time. The bright diagonal is the flame; its slope is the spread rate. It turns from sooty yellow to blue as the airflow drops; the cyan line is our tracked flame edge. NASA BASS-II photos (PSI-25).</figcaption>
        </figure>
        <Measure />
        <Orbit />
        <MoonGap />
        <HeadingRise />
      </div>
    </div>
  );
}
