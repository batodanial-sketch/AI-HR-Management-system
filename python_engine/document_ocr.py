from __future__ import annotations

import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader


@dataclass(frozen=True)
class OCRResult:
    source: str
    text: str
    page_count: int
    engine: str
    warnings: list[str]


def _pdf_text(path: Path) -> tuple[str, int]:
    reader = PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages).strip(), len(reader.pages)


def extract_document_text(path: str | Path, *, language: str = "eng") -> OCRResult:
    """Extract digital PDF text, or run local Tesseract for scanned PDFs.

    OCR never fabricates text: if Tesseract or Poppler is unavailable for a
    scanned document, the function raises a clear runtime error.
    """
    source = Path(path)
    if not source.is_file():
        raise FileNotFoundError(f"Document not found: {source}")
    if source.suffix.lower() != ".pdf":
        text = source.read_text(encoding="utf-8", errors="replace")
        return OCRResult(source=str(source), text=text, page_count=1, engine="plain_text", warnings=[])
    extracted, page_count = _pdf_text(source)
    if extracted:
        return OCRResult(source=str(source), text=extracted, page_count=page_count, engine="pypdf", warnings=[])
    if not shutil.which("tesseract") or not shutil.which("pdftoppm"):
        raise RuntimeError("Scanned PDF OCR requires local tesseract and pdftoppm binaries. No text was fabricated.")
    with tempfile.TemporaryDirectory(prefix="fluxentiq-ocr-") as directory:
        prefix = Path(directory) / "page"
        subprocess.run(["pdftoppm", "-png", "-r", "200", str(source), str(prefix)], check=True, capture_output=True, timeout=120)
        images = sorted(Path(directory).glob("page-*.png"))
        if not images:
            raise RuntimeError("PDF rasterization produced no images for OCR.")
        text_parts: list[str] = []
        for image in images:
            result = subprocess.run(["tesseract", str(image), "stdout", "-l", language], check=True, capture_output=True, text=True, timeout=60)
            text_parts.append(result.stdout)
    return OCRResult(source=str(source), text="\n".join(text_parts).strip(), page_count=page_count, engine="tesseract", warnings=["Text originated from OCR; human review is recommended."])
