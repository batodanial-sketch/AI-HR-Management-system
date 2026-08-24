from __future__ import annotations
from python_engine.tasks.slack_dispatcher import dispatch_slack
from python_engine.tasks.twilio_dispatcher import dispatch_twilio
def run_graph(graph:dict,context:dict)->list[dict]:
 out=[]
 for node in graph.get('nodes',[]):
  if node.get('type')=='slack':out.append(dispatch_slack(node.get('config',{}),context))
  elif node.get('type')=='twilio':out.append(dispatch_twilio(node.get('config',{}),context))
  else:out.append({'node_id':node.get('id'),'status':'recorded'})
 return out
