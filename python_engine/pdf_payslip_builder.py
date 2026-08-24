from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_payslip_pdf(
    path: str | Path,
    *,
    employee_name: str,
    period: str,
    gross: float,
    deductions: float,
    net: float,
    currency: str,
) -> Path:
    """Create a minimal, unsigned PDF payslip from supplied payroll values."""
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "Fluxentiq Payslip",
        employee_name,
        f"Period: {period}",
        f"Gross: {currency} {gross:.2f}",
        f"Deductions: {currency} {deductions:.2f}",
        f"Net: {currency} {net:.2f}",
        f"Generated: {datetime.now(UTC).date()}",
    ]
    commands = ["BT /F1 16 Tf 72 720 Td"]
    for index, line in enumerate(lines):
        commands.append(f"({_escape(line)}) Tj")
        if index < len(lines) - 1:
            commands.append("0 -28 Td")
    commands.append("ET")
    stream = " ".join(commands)
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(stream.encode('latin-1'))} >>\nstream\n{stream}\nendstream",
    ]
    output = "%PDF-1.4\n"
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(output.encode("latin-1")))
        output += f"{index} 0 obj\n{obj}\nendobj\n"
    xref_offset = len(output.encode("latin-1"))
    output += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n"
    output += "".join(f"{offset:010d} 00000 n \n" for offset in offsets[1:])
    output += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n"
    destination.write_bytes(output.encode("latin-1"))
    return destination
