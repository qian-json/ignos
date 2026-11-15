// Written with AI assistance (Claude Code)
/**
 * Minimal RFC 4180 CSV parser (no dependencies).
 *
 * - Fields may be quoted; `""` inside quotes is a literal quote; quoted fields may hold commas and newlines.
 * - LF or CRLF line endings; a UTF-8 BOM is ignored; blank lines are skipped.
 * - Lines starting with `#` are allowed only at the very top. `# key: value` lines become `meta`
 *   (mock files start with `# mock: true`). Real data files have no comment lines.
 */

export interface CsvRecord {
  /** 1-based line number in the file where this record starts. */
  line: number;
  cells: string[];
}

export interface ParsedCsv {
  /** `# key: value` pairs from the leading comment lines. */
  meta: Record<string, string>;
  /** Raw text of every leading comment line, without the `#`. */
  comments: string[];
  header: string[];
  records: CsvRecord[];
}

export class CsvSyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
    this.name = "CsvSyntaxError";
  }
}

export function parseCsv(input: string): ParsedCsv {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const meta: Record<string, string> = {};
  const comments: string[] = [];
  let i = 0;
  let line = 1;

  while (i < text.length && text[i] === "#") {
    let end = text.indexOf("\n", i);
    if (end === -1) end = text.length;
    const raw = text.slice(i + 1, end).replace(/\r$/, "").trim();
    comments.push(raw);
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(raw);
    if (m) meta[m[1]] = m[2].trim();
    i = end + 1;
    line++;
  }

  const all: CsvRecord[] = [];
  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false;
  let recordLine = line;

  const endRecord = () => {
    cells.push(field);
    if (!(cells.length === 1 && cells[0] === "")) all.push({ line: recordLine, cells });
    cells = [];
    field = "";
    afterQuote = false;
  };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        afterQuote = true;
        i++;
        continue;
      }
      if (c === "\n") line++;
      field += c;
      i++;
      continue;
    }
    if (c === ",") {
      cells.push(field);
      field = "";
      afterQuote = false;
      i++;
      continue;
    }
    if (c === "\r" && text[i + 1] === "\n") {
      i++;
      continue;
    }
    if (c === "\n") {
      endRecord();
      line++;
      recordLine = line;
      i++;
      continue;
    }
    if (afterQuote) throw new CsvSyntaxError("text after a closing quote", line);
    if (c === '"') {
      if (field !== "") throw new CsvSyntaxError("quote inside an unquoted field", line);
      inQuotes = true;
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (inQuotes) throw new CsvSyntaxError("unterminated quoted field", recordLine);
  if (field !== "" || cells.length > 0) endRecord();

  const [head, ...records] = all;
  if (!head) throw new CsvSyntaxError("no header row", line);
  return { meta, comments, header: head.cells, records };
}
