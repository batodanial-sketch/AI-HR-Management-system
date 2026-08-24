from __future__ import annotations
from python_engine.scraper import scrape_url

def scrape_public_profile(url:str):
 if 'linkedin.com' not in url.lower(): raise ValueError('Only an approved LinkedIn URL may be passed to this helper.')
 return scrape_url(url)
