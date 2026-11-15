# data/

| Folder | What goes here |
| --- | --- |
| `reference/` | Published source tables (CSV), taken unchanged from papers and NASA datasets. Never hand-edited. |
| `derived/` | Output of `scripts/` build steps (for example CSV-to-JSON with provenance). Regenerate rather than edit. |
| `mock/` | Small made-up fixtures for UI and tests. Never shown as real data. |

`/api/health` lists every file found here at build time (excluding `.gitkeep`).
