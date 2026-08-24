from __future__ import annotations
def linear_forecast(values:list[float],periods:int)->list[float]:
 if not values:raise ValueError('Historical values required.')
 slope=(values[-1]-values[0])/max(len(values)-1,1);return [round(values[-1]+slope*(i+1),2) for i in range(periods)]
