/**
 * Pure CSV serialization helpers for the server-side report exporters.
 *
 * Kept dependency-free (no `server-only`, no database imports) so the
 * formula-injection contract below is directly unit-testable.
 */

/**
 * Escapes one CSV cell.
 *
 * - Double quotes are doubled (RFC 4180).
 * - Spreadsheet formula injection (OWASP): cells whose first character is
 *   `=`, `+`, `@`, tab or CR are prefixed with a single quote so Excel /
 *   Google Sheets treat them as text, never as formulas. A leading `-` is
 *   only escaped when not followed by a digit, so legitimate negative
 *   numbers in numeric report columns keep their numeric meaning.
 */
export function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  const negativeNumber = /^-\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text);
  const leadingFormula =
    /^[=+@\t\r]/.test(text) || (text.startsWith("-") && !negativeNumber);
  const safe = leadingFormula ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [
    header.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ].join("\n");
}
