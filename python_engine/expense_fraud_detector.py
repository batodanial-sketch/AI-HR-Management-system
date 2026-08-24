from __future__ import annotations
def flag_expenses(expenses:list[dict])->list[str]:return [str(e.get('id')) for e in expenses if float(e.get('amount') or 0)>10000]