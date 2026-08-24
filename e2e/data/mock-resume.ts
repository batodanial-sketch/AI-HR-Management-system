/**
 * Deterministic PDF buffer generator for resume-upload E2E tests.
 *
 * Produces a structurally valid single-page PDF 1.4 document (correct xref
 * table and byte offsets) containing the candidate name and a Fluxentiq
 * header. Returned as a Buffer so it can be passed straight into Playwright's
 * setInputFiles / multipart upload without committing a binary fixture.
 */

export interface ResumeOptions {
  /** Candidate name rendered into the PDF body. */
  candidateName?: string;
}

function sanitizePdfText(value: string): string {
  const stripped = value.replace(/[()\\]/g, " ").trim();
  return stripped.length > 0 ? stripped : "E2E Candidate";
}

export function generateMockResumePdf(options: ResumeOptions = {}): Buffer {
  const candidateName = sanitizePdfText(options.candidateName ?? "E2E Candidate");
  const streamText = `BT /F1 18 Tf 72 720 Td (${candidateName}) Tj 0 -28 Td (Fluxentiq AI HR - Mock Resume) Tj ET`;

  const objectBodies: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${streamText.length} >>\nstream\n${streamText}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objectBodies.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  const objectCount = objectBodies.length;

  pdf += `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  // All content is ASCII, so latin1 keeps char offsets === byte offsets.
  return Buffer.from(pdf, "latin1");
}
