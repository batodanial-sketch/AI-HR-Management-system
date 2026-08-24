from __future__ import annotations
from python_engine.invoice_ocr_parser import parse_invoice_text
def scan_receipt(text:str)->dict:return parse_invoice_text(text)