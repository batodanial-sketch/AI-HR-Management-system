from __future__ import annotations
def check_invoice(invoice:dict)->list[str]:
 out=[]
 if not invoice.get('invoice_number'):out.append('Invoice number missing.')
 if not invoice.get('total_amount') or invoice['total_amount']<0:out.append('Invoice total is missing or invalid.')
 return out
