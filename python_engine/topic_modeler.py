from __future__ import annotations
from collections import Counter
def topics(texts:list[str],limit:int=10):return Counter(' '.join(texts).lower().split()).most_common(limit)
