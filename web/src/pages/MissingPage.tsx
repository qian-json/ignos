// Written with AI assistance (Claude Code)
// An address that isn't one of the site's pages.
import { PAGES } from "../router/routes";

export function MissingPage() {
  return (
    <div className="page page-missing">
      <section className="missing-page" aria-labelledby="missing-h">
        <h1 id="missing-h">Nothing at this address.</h1>
        <p>The page may have moved when the site was split into pages. Try one of these:</p>
        <ul>{PAGES.map((p) => <li key={p.id}><a href={p.path}>{p.label}</a></li>)}</ul>
      </section>
    </div>
  );
}
