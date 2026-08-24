from __future__ import annotations
import re
def parse_invoice_text(text:str)->dict:
 amount=re.search(r'(?:total|amount due)\D{0,20}(\d+[\d,]*\.\d{2})',text,re.I);number=re.search(r'invoice\s*(?:no|#)?\s*([A-Z0-9-]+)',text,re.I);return {'invoice_number':number.group(1) if number else None,'total_amount':float(amount.group(1).replace(',','')) if amount else None,'raw_text_length':len(text)}
