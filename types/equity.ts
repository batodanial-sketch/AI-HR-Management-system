export type EquityGrantType = 'option' | 'rsu' | 'share' | 'phantom'
export type EquityGrantStatus = 'draft' | 'active' | 'exercised' | 'cancelled' | 'expired'
export type EquityGrant = { id: string; employeeId: string; grantType: EquityGrantType; quantity: number; strikePrice: number | null; currencyCode: string; grantDate: string; vestingStartDate: string; vestingMonths: number; status: EquityGrantStatus }
export type VestingEvent = { id: string; equityGrantId: string; vestingDate: string; quantity: number; status: 'scheduled' | 'vested' | 'cancelled' }
