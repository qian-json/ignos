<!-- Written with AI assistance (Claude Code) -->
# Source documents

These source documents feed the Ask index (`scripts/ask-index/extract_pdf_pages.py` writes their page text to `scripts/ask-index/pdf_pages.json`, and `scripts/build-ask-index.mjs` builds passages from it and checks every quote against it).

| File | Document | Reuse terms (checked 2026-11-15) |
|---|---|---|
| `Link2018_SciRep_main.txt`, `Link2018_SciRep_SI.pdf` | Link et al. 2018, "The Effect of Gravity on Flame Spread over PMMA Cylinders", Scientific Reports 8:120, https://doi.org/10.1038/s41598-017-18398-4 | CC BY 4.0: reuse with attribution |
| `Ferkul_LPSC_2026_v2.pdf` | Ferkul et al., LPSC 2026 slides, "Material Flammability at Lunar and Martian Gravity" (FM2), NTRS 20260001966, https://ntrs.nasa.gov/citations/20260001966 | NTRS: distribution PUBLIC, copyright determination GOV_PERMITTED |
| `ICES_2025-392-correctedcaptions.pdf` | Urban, Olson, Dietrich et al., ICES-2025-392, "Solid Fuel Ignition Testing for Lunar Applications, Theory and Experimental Results", NTRS 20250002114, https://ntrs.nasa.gov/citations/20250002114 | NTRS: distribution PUBLIC, but "may include copyright material" and not a US Government work. **Not for redistribution:** leave this PDF and its pages in `pdf_pages.json` out of any public copy of the repo, and link the NTRS record instead. |

## Building without ICES-2025-392

If the ICES PDF is absent, `extract_pdf_pages.py` skips it. If `pdf_pages.json` has no `ices2025` pages, `build-ask-index.mjs` skips that paper's quoted passages and page chunks with a message, and the build and tests still pass (checked 2026-11-15: 261 passages instead of 311). The figure points digitized from the paper (`data/reference/ices2025_digitized*.csv`) and short cited quotes stay.

To strip the ICES pages from an existing `pdf_pages.json` without re-running the extractor:

```
node -e 'const f=require("fs"),p="scripts/ask-index/pdf_pages.json",d=JSON.parse(f.readFileSync(p,"utf8"));d.pages=d.pages.filter(x=>x.paper!=="ices2025");d.files=d.files.filter(x=>x.paper!=="ices2025");f.writeFileSync(p,JSON.stringify(d,null,1)+"\n")'
```
