// Written with AI assistance (Claude Code)
// The landing page: the film opening (headline, one sentence, the way in, then the story riding the
// film), the other pages as a row of picture cards, and the close.
import type { MouseEvent } from "react";
import { PageRing } from "../elements/PageRing";
import { StartHere } from "../elements/StartHere";
import { FilmOpening } from "../hero/FilmOpening";
import { Close } from "../panels/Close";
import { navigate } from "../router/router";

const pick = (href: string, e: MouseEvent<HTMLAnchorElement>) => { e.preventDefault(); navigate(href); };

export function HomePage() {
  return (
    <div className="page page-home">
      <FilmOpening />
      <StartHere onPick={pick} />
      <PageRing meta="Keep going" onPick={pick} />
      <Close />
    </div>
  );
}
