from __future__ import annotations
import json,urllib.request
def fetch_rate(base:str,quote:str,endpoint:str)->float:
 with urllib.request.urlopen(f'{endpoint}?base={base}&symbols={quote}',timeout=20)as r:data=json.loads(r.read().decode())
 rate=float(data.get('rates',{}).get(quote,0));
 if rate<=0:raise RuntimeError('FX provider returned no positive rate.');return rate
