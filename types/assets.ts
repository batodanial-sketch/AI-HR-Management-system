export type AssetStatus = 'available' | 'assigned' | 'maintenance' | 'retired' | 'lost'
export type AssetAssignmentStatus = 'assigned' | 'returned' | 'lost'

export type Asset = {
  id: string
  assetTag: string
  name: string
  category: string
  manufacturer: string | null
  model: string | null
  serialNumber: string | null
  status: AssetStatus
  purchaseDate: string | null
  purchaseCost: number | null
  currencyCode: string
}

export type AssetAssignment = {
  id: string
  assetId: string
  employeeId: string
  assignedAt: string
  dueBackAt: string | null
  returnedAt: string | null
  status: AssetAssignmentStatus
  assignmentCondition: string | null
  returnCondition: string | null
  notes: string | null
}

export type AssignAssetInput = {
  assetId: string
  employeeId: string
  dueBackAt?: string | null
  assignmentCondition?: string | null
  notes?: string | null
}
