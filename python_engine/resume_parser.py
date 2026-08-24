from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from docx import Document
from pypdf import PdfReader


@dataclass(frozen=True)
class ParsedResume:
    filename: str
    text: str
    email: str | None
    phone: str | None
    skills: list[str]
    years_experience: int | None
    source_type: Literal["pdf", "docx", "text"]


SKILL_DICTIONARY = [
    "Python", "n8n", "LangChain", "React", "Next.js", "TypeScript", "JavaScript",
    "Go", "Docker", "Kubernetes", "PostgreSQL", "Supabase", "SQL", "Figma",
    "Machine Learning", "MLOps", "AWS", "Azure", "GCP", "Terraform", "REST APIs",
]


def extract_text(path: str | Path) -> tuple[str, Literal["pdf", "docx", "text"]]:
    source = Path(path)
    suffix = source.suffix.lower()
    if suffix == ".pdf":
        reader = PdfReader(str(source))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        return text, "pdf"
    if suffix == ".docx":
        document = Document(str(source))
        text = "\n".join(paragraph.text for paragraph in document.paragraphs)
        return text, "docx"
    if suffix in {".txt", ".md", ".csv"}:
        return source.read_text(encoding="utf-8", errors="replace"), "text"
    raise ValueError("Supported resume formats are PDF, DOCX, TXT, Markdown, and CSV.")


def parse_resume(path: str | Path) -> ParsedResume:
    text, source_type = extract_text(path)
    normalized = re.sub(r"\s+", " ", text).strip()
    email_match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", normalized, re.IGNORECASE)
    phone_match = re.search(r"(?:\+?\d[\d\s().-]{7,}\d)", normalized)
    years = [int(value) for value in re.findall(r"\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b", normalized, re.IGNORECASE)]
    matched_skills = [skill for skill in SKILL_DICTIONARY if re.search(rf"(?<!\w){re.escape(skill)}(?!\w)", normalized, re.IGNORECASE)]
    return ParsedResume(
        filename=Path(path).name,
        text=normalized,
        email=email_match.group(0) if email_match else None,
        phone=phone_match.group(0).strip() if phone_match else None,
        skills=matched_skills,
        years_experience=max(years) if years else None,
        source_type=source_type,
    )
