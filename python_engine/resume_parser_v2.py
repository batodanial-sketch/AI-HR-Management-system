from __future__ import annotations
from python_engine.resume_parser import ParsedResume,parse_resume

def parse_resume_v2(path:str)->ParsedResume:
 result=parse_resume(path)
 if len(result.text)<20: raise ValueError('Resume extraction yielded insufficient text.')
 return result
