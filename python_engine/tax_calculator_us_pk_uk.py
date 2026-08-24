from __future__ import annotations
from dataclasses import dataclass
@dataclass(frozen=True)
class TaxEstimate: jurisdiction:str;gross:float;estimated_withholding:float;disclaimer:str
def estimate_withholding(jurisdiction:str,gross:float)->TaxEstimate:
 rates={'US':.22,'PK':.15,'UK':.20};code=jurisdiction.upper();
 if code not in rates:raise ValueError('Supported jurisdictions are US, PK, and UK.')
 return TaxEstimate(code,gross,round(gross*rates[code],2),'Illustrative estimate only. Use approved payroll and tax advice for actual withholding.')
