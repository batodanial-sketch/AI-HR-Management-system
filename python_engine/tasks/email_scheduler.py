from __future__ import annotations
from datetime import UTC,datetime
def schedule_email(to:str,subject:str,send_at:str)->dict:
 datetime.fromisoformat(send_at.replace('Z','+00:00'))
 if '@' not in to:raise ValueError('Valid recipient email required.')
 return {'to':to,'subject':subject,'send_at':send_at,'scheduled_at':datetime.now(UTC).isoformat()}
