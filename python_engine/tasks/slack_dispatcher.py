from __future__ import annotations
def dispatch_slack(config:dict,context:dict)->dict:
 if not config.get('channel') or not config.get('text'):raise ValueError('Slack action requires channel and text.')
 return {'channel':config['channel'],'text':str(config['text']),'status':'queued'}
