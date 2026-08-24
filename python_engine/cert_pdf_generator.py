from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path


def _escape_pdf(value: str) -> str:
    return value.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def generate_certificate_pdf(output_path: str | Path, *, recipient_name: str, course_title: str, issuer: str = 'Fluxentiq Learning') -> Path:
    """Generate a minimal valid PDF certificate without pretending to sign it cryptographically."""
    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    issued = datetime.now(UTC).strftime('%Y-%m-%d')
    lines = [issuer, 'Certificate of Completion', recipient_name, f'has completed {course_title}', f'Issued {issued}']
    stream = 'BT /F1 20 Tf 72 720 Td '
    for index, line in enumerate(lines):
        if index:
            stream += '0 -44 Td '
        stream += f'({_escape_pdf(line)}) Tj '
    stream += 'ET'
    objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        f'<< /Length {len(stream.encode("latin-1"))} >>\nstream\n{stream}\nendstream',
    ]
    content = '%PDF-1.4\n'
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(content.encode('latin-1')))
        content += f'{index} 0 obj\n{obj}\nendobj\n'
    xref = len(content.encode('latin-1'))
    content += f'xref\n0 {len(objects) + 1}\n0000000000 65535 f \n'
    content += ''.join(f'{offset:010d} 00000 n \n' for offset in offsets[1:])
    content += f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'
    destination.write_bytes(content.encode('latin-1'))
    return destination
