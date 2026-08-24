import "server-only";
import { getCurrentUser } from "@/lib/auth";
import { getEmployees, getCandidates, getLeads, getDeals, getLeaveRequests } from "@/lib/api";

/**
 * Server-side report/export builders.
 *
 * Generates CSV (and JSON) payloads for HR + lead-intelligence datasets from
 * the active memory backend. Used by the export API routes; unlike the
 * client-side leads CSV, these run server-side so they can be permission- and
 * license-gated.
 */

function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(header: string[], rows: unknown[][]): string {
  return [header.map(csvEscape).join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\n");
}

export interface Report {
  filename: string;
  contentType: string;
  content: string;
}

export async function buildEmployeesReport(): Promise<Report> {
  const employees = await getEmployees();
  const content = toCsv(
    ["id", "first_name", "last_name", "email", "department", "role", "status", "start_date", "location"],
    employees.map((e) => [
      e.id, e.firstName, e.lastName, e.email, e.department, e.role,
      e.employmentStatus, e.startDate, e.location,
    ]),
  );
  return { filename: "employees.csv", contentType: "text/csv", content };
}

export async function buildCandidatesReport(): Promise<Report> {
  const candidates = await getCandidates();
  const content = toCsv(
    ["id", "first_name", "last_name", "email", "role", "stage", "match_score", "source"],
    candidates.map((c) => [
      c.id, c.firstName, c.lastName, c.email, c.role, c.stage, c.matchScore, c.source,
    ]),
  );
  return { filename: "candidates.csv", contentType: "text/csv", content };
}

export async function buildLeadsReport(): Promise<Report> {
  const leads = await getLeads();
  const content = toCsv(
    ["id", "first_name", "last_name", "email", "company", "title", "source", "status", "score"],
    leads.map((l) => [
      l.id, l.firstName, l.lastName, l.email, l.company, l.title, l.source, l.status, l.score,
    ]),
  );
  return { filename: "leads.csv", contentType: "text/csv", content };
}

export async function buildDealsReport(): Promise<Report> {
  const deals = await getDeals();
  const content = toCsv(
    ["id", "name", "value", "currency", "stage", "probability", "expected_close_date"],
    deals.map((d) => [
      d.id, d.name, d.value, d.currency, d.stage, d.probability, d.expectedCloseDate ?? "",
    ]),
  );
  return { filename: "deals.csv", contentType: "text/csv", content };
}

export async function buildLeaveReport(): Promise<Report> {
  const requests = await getLeaveRequests();
  const content = toCsv(
    ["id", "employee", "type", "start_date", "end_date", "status", "reason"],
    requests.map((r) => [
      r.id, r.employeeName, r.type, r.startDate, r.endDate, r.status, r.reason,
    ]),
  );
  return { filename: "leave-requests.csv", contentType: "text/csv", content };
}

export async function buildSystemStatusReport(): Promise<Report> {
  const user = await getCurrentUser();
  const content = JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      user: { email: user.email, role: user.role },
      counts: {
        employees: (await getEmployees()).length,
        candidates: (await getCandidates()).length,
        leads: (await getLeads()).length,
        deals: (await getDeals()).length,
        leaveRequests: (await getLeaveRequests()).length,
      },
    },
    null,
    2,
  );
  return { filename: "system-status.json", contentType: "application/json", content };
}
