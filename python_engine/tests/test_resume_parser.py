from pathlib import Path
from python_engine.resume_parser import parse_resume
def test_parse_text_resume(tmp_path:Path):
 p=tmp_path/'resume.txt';p.write_text('Ada ada@example.com 5 years Python SQL')
 r=parse_resume(p);assert r.email=='ada@example.com';assert 'Python' in r.skills
