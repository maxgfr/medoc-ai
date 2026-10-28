/** Reading the sources' text files, the same in Bun and in the browser. */

/** UTF-8 when the bytes are valid UTF-8, else Windows-1252 (the BDPM mixes both). */
export function decodeBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Tab-separated rows without a header, every cell trimmed; blank lines dropped. */
export function tsvRows(text: string): string[][] {
  const out: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    out.push(line.split("\t").map((c) => c.trim()));
  }
  return out;
}

/** dd/mm/yyyy, dd.mm.yyyy, yyyymmdd or yyyy-mm-dd → yyyy-mm-dd. */
export function isoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let m = /^(\d{2})[/.](\d{2})[/.](\d{4})$/.exec(value);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return undefined;
}

/** "1 234,56" → 1234.56; undefined when empty or not a number. */
export function decimal(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  laquo: "«",
  raquo: "»",
  deg: "°",
  micro: "µ",
  middot: "·",
  bull: "•",
  times: "×",
  ge: "≥",
  le: "≤",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  euml: "ë",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  icirc: "î",
  iuml: "ï",
  ocirc: "ô",
  ugrave: "ù",
  ucirc: "û",
  Eacute: "É",
  Egrave: "È",
  Agrave: "À",
  Ccedil: "Ç",
  oelig: "œ",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body] ?? match;
  });
}

/** HTML → plain text: block ends become new lines, everything else is dropped. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/\r/g, "")
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h\d|tr|table|ul|ol|section)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * RFC 4180 rows: a quoted field may hold the delimiter, line breaks and
 * doubled quotes. Cells are trimmed; blank lines and `#` comment lines dropped.
 */
export function csvRows(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endRow = () => {
    row.push(field.trim());
    if (row.some((x) => x) && !row[0]?.startsWith("#")) rows.push(row);
    row = [];
    field = "";
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (c === '"' && !field.trim()) {
      quoted = true;
      field = "";
    } else if (c === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (c === "\n") endRow();
    else if (c !== "\r") field += c;
  }
  if (field || row.length) endRow();
  return rows;
}
