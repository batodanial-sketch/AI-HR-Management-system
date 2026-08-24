from __future__ import annotations
import json
from urllib.request import Request,urlopen
from python_engine.config import PythonEngineConfig
class SupabasePythonClient:
 def __init__(self,config:PythonEngineConfig|None=None):
  self.config=config or PythonEngineConfig.from_env()
  if not self.config.supabase_url or not self.config.supabase_service_role_key: raise RuntimeError('SUPABASE_URL and SUPABASE_SECRET_KEY are required for Python Supabase writes.')
 def request(self,path:str,method:str='GET',payload:dict|None=None):
  req=Request(self.config.supabase_url.rstrip('/')+path,data=json.dumps(payload).encode() if payload else None,headers={'apikey':self.config.supabase_service_role_key,'Authorization':f'Bearer {self.config.supabase_service_role_key}','Content-Type':'application/json'},method=method)
  with urlopen(req,timeout=30) as r:return json.loads(r.read().decode() or 'null')
