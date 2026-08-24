export type ActionResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export const actionSuccess = <T>(data: T): ActionResponse<T> => ({ success: true, data })
export const actionFailure = <T = never>(error: string): ActionResponse<T> => ({ success: false, error })
