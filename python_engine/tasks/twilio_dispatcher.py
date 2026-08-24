from __future__ import annotations
def dispatch_twilio(config:dict,context:dict)->dict:
 if not config.get('to') or not config.get('body'):raise ValueError('Twilio action requires to and body.')
 return {'to':config['to'],'body':str(config['body']),'status':'queued'}
