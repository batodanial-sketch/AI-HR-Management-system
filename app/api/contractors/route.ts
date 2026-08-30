import { z } from "zod";
import { getContractorInvoices } from "@/lib/domain";
import { handleModuleCreate, handleModuleList } from "@/lib/module-crud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Contractors/invoices are org-wide procurement data — HR_ADMIN+ only. */
const createSchema = z.object({
  legalName: z.string().min(2).max(240),
  email: z.string().email().max(240),
  countryCode: z.string().length(2).optional().nullable(),
  currencyCode: z.string().length(3).default("USD").transform((value) => value.toUpperCase()),
  status: z.enum(["active", "inactive", "terminated"]).default("active"),
});

export async function GET(): Promise<Response> {
  return handleModuleList(getContractorInvoices, { minRole: "HR_ADMIN" });
}

export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  return handleModuleCreate(
    "contractors",
    createSchema,
    input,
    (parsed) => ({
      legal_name: parsed.legalName,
      email: parsed.email,
      country_code: parsed.countryCode ?? null,
      currency_code: parsed.currencyCode,
      status: parsed.status,
    }),
    { minRole: "HR_ADMIN" },
  );
}
