import "server-only";
import { evaluatePtoSchema } from "@/lib/validations/ai";

/**
 * Evaluates PTO (Paid Time Off) request using AI
 * @param employeeId - UUID of the employee
 * @param ptoDays - Number of PTO days requested
 * @param reason - Optional reason for the request
 * @returns PTO evaluation result
 */
export async function evaluatePto(
  employeeId: string,
  ptoDays: number,
  reason?: string,
): Promise<unknown> {
  const validated = evaluatePtoSchema.parse({ employeeId, ptoDays, reason });

  // In a real implementation, call Python bridge:
  // const response = await fetch(`${bridgeUrl()}/api/ai/evaluate-pto`, {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({ employeeId, ptoDays, reason }),
  // });
  // return response.json();

  // Simulate response
  return {
    employeeId: validated.employeeId,
    ptoDays: validated.ptoDays,
    reason: validated.reason,
    recommendation: validated.ptoDays <= 5 ? "Approved" : "Requires manager review",
    estimatedBalance: 15 - validated.ptoDays,
  };
}

/**
 * Validates PTO evaluation parameters
 * @param params - Parameters to validate
 * @returns Validated parameters
 */
export function validateEvaluatePtoParams(
  params: unknown,
): { employeeId: string; ptoDays: number; reason?: string } {
  return evaluatePtoSchema.parse(params);
}

/**
 * Formats PTO evaluation response
 * @param data - Raw evaluation result
 * @returns Formatted response
 */
export function formatEvaluatePtoResponse(
  data: unknown,
): { success: boolean; data: unknown } {
  return { success: true, data };
}

/**
 * Handles PTO evaluation errors
 * @param error - Caught error
 * @returns Error response
 */
export function handleEvaluatePtoError(
  error: unknown,
): { success: boolean; error: string; status: number } {
  const message =
    error instanceof Error ? error.message : "PTO evaluation failed.";
  return { success: false, error: message, status: 500 };
}