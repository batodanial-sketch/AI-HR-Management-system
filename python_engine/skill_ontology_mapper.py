from __future__ import annotations
def map_skills(skills:list[str])->dict[str,list[str]]:return {s.strip().lower():[s.strip()] for s in skills if s.strip()}
