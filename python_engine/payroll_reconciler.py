from __future__ import annotations
def reconcile_entries(entries:list[dict])->list[str]:
 errors=[]
 for e in entries:
  gross=float(e.get('gross_pay') or 0);ded=float(e.get('total_deductions') or 0);net=float(e.get('net_pay') or 0)
  if ded>gross:errors.append(f"{e.get('id','entry')}: deductions exceed gross")
  if abs((gross-ded)-net)>0.02:errors.append(f"{e.get('id','entry')}: net does not reconcile to gross less deductions")
 return errors
