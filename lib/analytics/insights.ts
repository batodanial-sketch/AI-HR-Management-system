import "server-only";

import {
  computeFlightRisk,
  detectExpenseAnomalies,
  forecastHeadcountAndRunway,
  latestEnps,
  offboardingPressure,
  orgExpenseVelocity,
  type ExpenseAnomaly,
  type FlightRiskResult,
  type RunwayForecast,
} from "@/lib/analytics/predictive";
import {
  getEquityGrants,
  getExpenses,
  getOffboardingCases,
  getPulseSurveys,
  getWorkforceScenarios,
} from "@/lib/domain";
import { getDashboardMetrics } from "@/lib/api";

/**
 * Cross-module insight aggregation (server-side). Pulls Expenses, Pulse
 * Surveys, Offboarding, Workforce Planning and Equity through the domain
 * layer (live Supabase with seed fallback) and computes the predictive
 * analytics rendered on the executive dashboard + module overviews.
 */

export interface DashboardInsights {
  flightRisks: FlightRiskResult[];
  expenseAnomalies: ExpenseAnomaly[];
  forecast: RunwayForecast;
  summary: {
    expenseVelocityTotal: number;
    expenseVelocityPerEmployee: number;
    enps: number | null;
    offboardingActive: number;
    offboardingCompleted: number;
    highSeverityAnomalies: number;
    criticalFlightRisks: number;
  };
}

export async function getDashboardInsights(): Promise<DashboardInsights> {
  const [expenses, surveys, offboardingCases, scenarios, equity, metrics] = await Promise.all([
    getExpenses(),
    getPulseSurveys(),
    getOffboardingCases(),
    getWorkforceScenarios(),
    getEquityGrants(),
    getDashboardMetrics(),
  ]);

  const velocity = orgExpenseVelocity(expenses);
  const enps = latestEnps(surveys);
  const offboarding = offboardingPressure(offboardingCases);
  const anomalies = detectExpenseAnomalies(expenses);

  // Per-employee flight risk: expense velocity vs org average, org eNPS, and
  // the employee's own offboarding case (matched by name).
  const offboardingByName = new Map(
    offboardingCases.map((entry) => [entry.employeeName, entry] as const),
  );
  const expenseByEmployee = new Map<string, number>();
  for (const expense of expenses) {
    expenseByEmployee.set(
      expense.employeeName,
      (expenseByEmployee.get(expense.employeeName) ?? 0) + expense.amount,
    );
  }
  const flightRisks = [...expenseByEmployee.entries()]
    .map(([employeeName, expenseTotal]) =>
      computeFlightRisk({
        employeeName,
        expenseTotal,
        orgAvgExpenseTotal: velocity.perEmployee,
        orgEnps: enps,
        ownOffboarding: offboardingByName.get(employeeName) ?? null,
      }),
    )
    .sort((a, b) => b.score - a.score);

  const headcount = metrics.find((metric) => metric.key === "headcount")?.value ?? 0;
  // Monthly burn approximates the payroll metric; integrations may replace
  // this with a payroll-run-derived figure.
  const monthlyBurn = metrics.find((metric) => metric.key === "payroll")?.value ?? null;

  const forecast = forecastHeadcountAndRunway({
    scenarios,
    equityGrants: equity,
    currentHeadcount: Number(headcount) || 0,
    monthlyBurn,
  });

  return {
    flightRisks,
    expenseAnomalies: anomalies,
    forecast,
    summary: {
      expenseVelocityTotal: velocity.total,
      expenseVelocityPerEmployee: velocity.perEmployee,
      enps,
      offboardingActive: offboarding.active,
      offboardingCompleted: offboarding.completed,
      highSeverityAnomalies: anomalies.filter((anomaly) => anomaly.severity === "high").length,
      criticalFlightRisks: flightRisks.filter((risk) => risk.level === "critical").length,
    },
  };
}
