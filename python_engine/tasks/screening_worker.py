from __future__ import annotations
from python_engine.resume_parser_v2 import parse_resume_v2
def run_screening(path:str)->dict:return {'resume':parse_resume_v2(path).__dict__}
