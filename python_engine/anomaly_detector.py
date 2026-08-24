from __future__ import annotations
from dataclasses import dataclass
@dataclass(frozen=True)
class AttendanceAnomaly: employee_id:str;kind:str;severity:str;detail:str
def detect_attendance_anomalies(records:list[dict])->list[AttendanceAnomaly]:
 out=[]
 for r in records:
  if int(r.get('overtime_minutes') or 0)>=600:out.append(AttendanceAnomaly(str(r['employee_id']),'sustained_overtime','warning','Recorded overtime meets review threshold.'))
  if r.get('status')=='absent':out.append(AttendanceAnomaly(str(r['employee_id']),'absence','info','Recorded absence requires policy context.'))
 return out
