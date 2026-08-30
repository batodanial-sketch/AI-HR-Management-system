import type {
  EquityGrant,
  Expense,
  OffboardingCase,
  PulseSurvey,
  WorkforceScenario,
} from "@/lib/domain";

/**
 * Predictive HR analytics — pure, deterministic computation routines over
 * cross-module aggregates (Expenses, Pulse Surveys, Offboarding, Workforce
 * Planning, Equity). No I/O here: `lib/analytics/insights.ts` feeds these
 * routines from the domain layer.
 */

/* ── Flight risk ─────────────────────────────────────────────────────────── */

export type FlightRiskLevel = "low" | "moderate" | "high" | "critical";

export interface FlightRiskInput {
  employeeName: string;
  /** Sum of the employee's recent expense claims. */
  expenseTotal: number;
  /** Organization-wide average expense total per employee. */
  orgAvgExpenseTotal: number;
  /** Organization eNPS from the latest pulse survey (-100..100). */
  orgEnps: number | null;
  /** The employee's own offboarding case, if any. */
  ownOffboarding: OffboardingCase | null;
}

export interface FlightRiskResult {
  employeeName: string;
  /** 0–100 composite risk score. */
  score: number;
  level: FlightRiskLevel;
  factors: string[];
}

export function computeFlightRisk(input: FlightRiskInput): FlightRiskResult {
  const factors: string[] = [];

  // Expense velocity: above-average claim volume correlates with disengagement
  // bursts (and occasionally exit preparation).
  const expenseRatio =
    input.orgAvgExpenseTotal > 0 ? input.expenseTotal / input.orgAvgExpenseTotal : 0;
  let expenseComponent = 0;
  if (expenseRatio >= 3) {
    expenseComponent = 0.35;
    factors.push(`Expense velocity ${expenseRatio.toFixed(1)}× org average`);
  } else if (expenseRatio >= 2) {
    expenseComponent = 0.2;
    factors.push(`Expense velocity ${expenseRatio.toFixed(1)}× org average`);
  }

  // Pulse: low org eNPS is a systemic driver; strong eNPS dampens risk.
  let pulseComponent = 0;
  if (input.orgEnps !== null) {
    if (input.orgEnps < 0) {
      pulseComponent = 0.25;
      factors.push(`Organization eNPS ${input.orgEnps} (detractor territory)`);
    } else if (input.orgEnps < 10) {
      pulseComponent = 0.15;
      factors.push(`Organization eNPS ${input.orgEnps} (below benchmark)`);
    }
  }

  // Offboarding patterns: an active exit case is the strongest single signal.
  let offboardingComponent = 0;
  if (input.ownOffboarding) {
    if (input.ownOffboarding.status === "in_progress") {
      offboardingComponent = 0.4;
      factors.push("Exit workflow in progress");
    } else if (input.ownOffboarding.status === "planned") {
      offboardingComponent = 0.3;
      factors.push("Offboarding planned");
    }
  }

  const score = Math.min(
    100,
    Math.round(
      100 *
        Math.min(0.65, expenseComponent + pulseComponent + offboardingComponent),
    ),
  );

  const level: FlightRiskLevel =
    score >= 70 ? "critical" : score >= 45 ? "high" : score >= 25 ? "moderate" : "low";

  return { employeeName: input.employeeName, score, level, factors };
}

/* ── Expense anomaly detection ───────────────────────────────────────────── */

export interface ExpenseAnomaly {
  id: string;
  /** The source expense row id this anomaly refers to. */
  expenseId: string;
  employeeName: string;
  merchant: string;
  amount: number;
  category: string;
  severity: "high" | "medium";
  reason: string;
}

/** Merchants/categories that are out of policy by definition. */
const POLICY_DENYLIST: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /casino|gambl|bet365|draftkings|fanduel/i, label: "gambling merchant" },
  { pattern: /crypto|bitcoin|coinbase|binance/i, label: "cryptocurrency purchase" },
  { pattern: /adult|escort|night club|nightclub/i, label: "prohibited merchant category" },
];

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Flags out-of-policy expense claims BEFORE approval. Baselines are computed
 * from approved claims only, so a pending outlier is measured against the
 * organization's real spending pattern.
 */
export function detectExpenseAnomalies(expenses: Expense[]): ExpenseAnomaly[] {
  const anomalies: ExpenseAnomaly[] = [];
  const approved = expenses.filter((expense) => expense.status === "approved");
  const mediansByCategory = new Map<string, number>();
  for (const category of new Set(approved.map((expense) => expense.category))) {
    mediansByCategory.set(
      category,
      median(approved.filter((expense) => expense.category === category).map((expense) => expense.amount)),
    );
  }

  // Duplicate detection: same employee + merchant + amount appearing twice.
  const seen = new Map<string, Expense>();
  for (const expense of expenses) {
    if (expense.status !== "pending" && expense.status !== "approved") continue;
    const key = `${expense.employeeName}|${expense.merchant}|${expense.amount}`;
    const prior = seen.get(key);
    if (prior) {
      anomalies.push({
        id: `dup-${expense.id}`,
        expenseId: expense.id,
        employeeName: expense.employeeName,
        merchant: expense.merchant,
        amount: expense.amount,
        category: expense.category,
        severity: "medium",
        reason: "Possible duplicate submission (same merchant and amount).",
      });
    }
    seen.set(key, expense);
  }

  for (const expense of expenses) {
    if (expense.status !== "pending") continue; // only flag pre-approval claims

    const denylisted = POLICY_DENYLIST.find(({ pattern }) => pattern.test(expense.merchant));
    if (denylisted) {
      anomalies.push({
        id: `policy-${expense.id}`,
        expenseId: expense.id,
        employeeName: expense.employeeName,
        merchant: expense.merchant,
        amount: expense.amount,
        category: expense.category,
        severity: "high",
        reason: `Out of policy — ${denylisted.label}.`,
      });
      continue;
    }

    const categoryMedian = mediansByCategory.get(expense.category) ?? 0;
    if (categoryMedian > 0 && expense.amount >= Math.max(categoryMedian * 3, 1_000)) {
      anomalies.push({
        id: `outlier-${expense.id}`,
        expenseId: expense.id,
        employeeName: expense.employeeName,
        merchant: expense.merchant,
        amount: expense.amount,
        category: expense.category,
        severity: "high",
        reason: `${expense.amount.toLocaleString()} is ${(expense.amount / categoryMedian).toFixed(1)}× the ${expense.category} category median (${categoryMedian.toLocaleString()}).`,
      });
    } else if (categoryMedian > 0 && expense.amount >= categoryMedian * 2) {
      anomalies.push({
        id: `outlier-${expense.id}`,
        expenseId: expense.id,
        employeeName: expense.employeeName,
        merchant: expense.merchant,
        amount: expense.amount,
        category: expense.category,
        severity: "medium",
        reason: `${expense.amount.toLocaleString()} is ${(expense.amount / categoryMedian).toFixed(1)}× the ${expense.category} category median (${categoryMedian.toLocaleString()}).`,
      });
    }
  }

  return anomalies.sort((a, b) => (a.severity === b.severity ? b.amount - a.amount : a.severity === "high" ? -1 : 1));
}

/* ── Headcount & runway forecasting ──────────────────────────────────────── */

export interface HeadcountForecastPoint {
  month: number;
  headcount: number;
}

export interface RunwayForecast {
  currentHeadcount: number;
  /** Projected headcount for the next 6 months (1-indexed month labels). */
  forecast: HeadcountForecastPoint[];
  /** Average monthly growth rate derived from active planning scenarios. */
  monthlyGrowthRate: number;
  /** Total budget across approved scenarios (currency-agnostic). */
  budgetPool: number;
  /** Unvested/active equity grant exposure. */
  equityGrantTotal: number;
  /** Months of runway at the given monthly burn (null = unknown burn). */
  runwayMonths: number | null;
  /** Number of scenarios averaged into the projection. */
  scenarioCount: number;
}

export function forecastHeadcountAndRunway(input: {
  scenarios: WorkforceScenario[];
  equityGrants: EquityGrant[];
  currentHeadcount: number;
  monthlyBurn: number | null;
}): RunwayForecast {
  const { scenarios, equityGrants, currentHeadcount, monthlyBurn } = input;

  const activeScenarios = scenarios.filter((scenario) => scenario.status === "approved");
  const scenarioCount = activeScenarios.length;

  const growthRates = activeScenarios
    .filter((scenario) => scenario.headcountForecast > 0)
    .map((scenario) => {
      const totalGrowth = scenario.headcountForecast / Math.max(currentHeadcount, 1) - 1;
      // Spread scenario growth across 6 months.
      return totalGrowth > -1 ? Math.pow(1 + Math.max(totalGrowth, -0.9), 1 / 6) - 1 : 0;
    });
  const monthlyGrowthRate =
    growthRates.length > 0
      ? growthRates.reduce((sum, rate) => sum + rate, 0) / growthRates.length
      : 0;

  const forecast: HeadcountForecastPoint[] = [];
  let projected = currentHeadcount;
  for (let month = 1; month <= 6; month += 1) {
    projected = Math.max(0, Math.round(projected * (1 + monthlyGrowthRate)));
    forecast.push({ month, headcount: projected });
  }

  const budgetPool = activeScenarios.reduce(
    (sum, scenario) => sum + (Number.isFinite(scenario.budgetForecast) ? scenario.budgetForecast : 0),
    0,
  );
  const equityGrantTotal = equityGrants
    .filter((grant) => grant.status === "active")
    .reduce((sum, grant) => sum + grant.quantity * Math.max(grant.strikePrice ?? 0, 1), 0);

  const runwayMonths =
    monthlyBurn && monthlyBurn > 0 ? Math.round((budgetPool / monthlyBurn) * 10) / 10 : null;

  return {
    currentHeadcount,
    forecast,
    monthlyGrowthRate,
    budgetPool,
    equityGrantTotal,
    runwayMonths,
    scenarioCount,
  };
}

/* ── Cross-module aggregation helpers ────────────────────────────────────── */

export function orgExpenseVelocity(expenses: Expense[]): {
  total: number;
  perEmployee: number;
  employeeCount: number;
  topCategory: string | null;
} {
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    totals.set(expense.employeeName, (totals.get(expense.employeeName) ?? 0) + expense.amount);
  }
  const employeeCount = totals.size;
  const total = [...totals.values()].reduce((sum, value) => sum + value, 0);

  const byCategory = new Map<string, number>();
  for (const expense of expenses) {
    byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amount);
  }
  const topCategory =
    [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    total,
    perEmployee: employeeCount > 0 ? total / employeeCount : 0,
    employeeCount,
    topCategory,
  };
}

export function latestEnps(surveys: PulseSurvey[]): number | null {
  const scored = surveys.filter((survey) => survey.eNPS !== null && survey.status !== "draft");
  if (scored.length === 0) return null;
  return scored.reduce((sum, survey) => sum + (survey.eNPS ?? 0), 0) / scored.length;
}

export function offboardingPressure(cases: OffboardingCase[]): {
  active: number;
  completed: number;
  total: number;
} {
  return {
    active: cases.filter((entry) => entry.status !== "completed").length,
    completed: cases.filter((entry) => entry.status === "completed").length,
    total: cases.length,
  };
}
