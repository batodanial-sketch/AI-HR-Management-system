from __future__ import annotations
import hashlib,math,os
from typing import Iterable

def generate_embedding(text:str,dimensions:int=1536)->list[float]:
 if os.getenv('FLUXENTIQ_EMBEDDING_PROVIDER','disabled')=='disabled': raise RuntimeError('Embedding provider is disabled. Configure FLUXENTIQ_EMBEDDING_PROVIDER before semantic search.')
 if not text.strip(): raise ValueError('Text is required for an embedding.')
 values=[]
 for index in range(dimensions):
  digest=hashlib.sha256(f'{index}:{text}'.encode()).digest();values.append((int.from_bytes(digest[:4],'big')/2**32)*2-1)
 norm=math.sqrt(sum(v*v for v in values));return [v/norm for v in values]
def cosine_similarity(a:Iterable[float],b:Iterable[float])->float:
 aa=list(a);bb=list(b)
 if len(aa)!=len(bb) or not aa: raise ValueError('Vectors must have equal non-zero dimensions.')
 return sum(x*y for x,y in zip(aa,bb))
