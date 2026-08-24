from __future__ import annotations
from python_engine.sentiment_analyzer import analyze_sentiment
def analyze_survey_responses(responses:list[str])->dict:return analyze_sentiment(responses).__dict__
