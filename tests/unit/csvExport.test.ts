/**
 * Phase XI (ultimate audit) — CSV export formula-injection contract.
 *
 * Server-side report exporters (lib/reports.ts → lib/csv-export.ts) produce
 * CSVs from org-controlled records (employee/candidate/lead names, etc.).
 * Fields that begin with spreadsheet formula characters must be neutralized
 * so opening an exported report in Excel/Sheets can never evaluate
 * attacker-influenced cell content as a formula (OWASP CSV injection).
 */

import { csvEscape, toCsv } from "@/lib/csv-export";

describe("csvEscape", () => {
  it("wraps plain values in quotes and doubles embedded quotes (RFC 4180)", () => {
    expect(csvEscape("Ada Lovelace")).toBe('"Ada Lovelace"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it("neutralizes cells that start with formula-introducing characters", () => {
    const input = '=HYPERLINK("http://evil")';
    const out = csvEscape(input);
    // output: '"' + "'=HYPERLINK(""http://evil"")" + '"'
    expect(out).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(out.startsWith('"\'=')).toBe(true);

    expect(csvEscape("+cmd|' /C calc'!A0")).toBe('"\'+cmd|\' /C calc\'!A0"');
    expect(csvEscape("@SUM(A1:A9)")).toBe('"\'@SUM(A1:A9)"');
    expect(csvEscape("\t=2+2")).toBe('"\'\t=2+2"');
    expect(csvEscape("\r=1")).toBe('"\'\r=1"');
  });

  it("neutralizes a leading minus unless the cell is a plain negative number", () => {
    // Formula-ish leading dash ("-2+3", "-HYPERLINK(...)") is neutralized.
    expect(csvEscape("-2+3")).toBe('"\'-2+3"');
    expect(csvEscape("-HYPERLINK(x)")).toBe('"\'-HYPERLINK(x)"');
    // Negative numeric literals keep their numeric meaning in spreadsheets.
    expect(csvEscape(-12.5)).toBe('"-12.5"');
    expect(csvEscape(-0.01)).toBe('"-0.01"');
    expect(csvEscape("-3.14e2")).toBe('"-3.14e2"');
  });

  it("handles null/empty and dangerous chars appearing mid-cell", () => {
    expect(csvEscape(null)).toBe('""');
    expect(csvEscape(undefined)).toBe('""');
    expect(csvEscape("")).toBe('""');
    // A '=' in the middle of a cell is not a formula start.
    expect(csvEscape("a=b")).toBe('"a=b"');
  });
});

describe("toCsv", () => {
  it("renders a full table with headers and escaped rows", () => {
    const out = toCsv(
      ["name", "email"],
      [
        ["=1+1", "admin@example.com"],
        ["Jane Doe", "-3"],
      ],
    );
    const lines = out.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('"name","email"');
    expect(lines[1].startsWith('"\'=1+1"')).toBe(true);
    expect(lines[2]).toBe('"Jane Doe","-3"');
  });
});
