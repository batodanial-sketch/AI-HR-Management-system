from __future__ import annotations
from python_engine.anomaly_detector import detect_attendance_anomalies
def run_attendance_sync(records:list[dict])->dict:return {'anomalies':[a.__dict__ for a in detect_attendance_anomalies(records)]}
