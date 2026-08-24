-- Fluxentiq · seed.sql — deterministic demo data
-- ---------------------------------------------------------------------------
-- Runs after `supabase db reset`. Creates the demo organization and populates
-- HR + lead-intelligence records with fixed UUIDs so the app is usable
-- immediately after a fresh reset. The demo auth user is created on first
-- signup (not here), since auth.users requires the admin API.

-- Demo organization
insert into public.organizations (id, name, slug, plan, billing_status)
values (
  '11111111-1111-4111-8111-111111111111',
  'Fluxentiq HQ',
  'fluxentiq-hq',
  'enterprise',
  'trialing'
)
on conflict (id) do nothing;

-- Employees
insert into public.employees (id, organization_id, first_name, last_name, email, department, role, title, employment_status, start_date, location)
values
  ('00000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Ayesha', 'Rahman', 'ayesha.rahman@fluxentiq.test', 'Engineering', 'Backend Engineer', 'Staff Backend Engineer', 'active', '2022-03-14', 'Karachi, PK'),
  ('00000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Daniel', 'Mbeki', 'daniel.mbeki@fluxentiq.test', 'Design', 'Product Designer', 'Senior Product Designer', 'active', '2021-11-02', 'Remote, ZA'),
  ('00000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Sofia', 'Lindqvist', 'sofia.lindqvist@fluxentiq.test', 'People Ops', 'HR Business Partner', 'Lead HRBP', 'on_leave', '2020-06-22', 'Stockholm, SE'),
  ('00000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Miguel', 'Torres', 'miguel.torres@fluxentiq.test', 'Engineering', 'Frontend Engineer', 'Frontend Engineer II', 'active', '2023-02-13', 'Mexico City, MX'),
  ('00000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'Priya', 'Nair', 'priya.nair@fluxentiq.test', 'Finance', 'Payroll Analyst', 'Payroll Analyst', 'active', '2022-08-01', 'Bengaluru, IN'),
  ('00000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'Omar', 'Haddad', 'omar.haddad@fluxentiq.test', 'Sales', 'Account Executive', 'Account Executive', 'terminated', '2021-01-18', 'Dubai, AE')
on conflict (id) do nothing;

-- Job posting + candidates
insert into public.job_postings (id, organization_id, title, department, location, status)
values ('00000000-0000-4000-8000-000000000201', '11111111-1111-4111-8111-111111111111', 'Software Engineer', 'Engineering', 'Remote', 'open')
on conflict (id) do nothing;

insert into public.candidates (id, organization_id, job_posting_id, first_name, last_name, email, role, stage, match_score, source)
values
  ('00000000-0000-4000-8000-000000000101', '11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000201', 'Lena', 'Kowalski', 'lena.kowalski@example.com', 'Backend Engineer', 'applied', 78, 'LinkedIn'),
  ('00000000-0000-4000-8000-000000000102', '11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000201', 'Theo', 'Dubois', 'theo.dubois@example.com', 'Backend Engineer', 'screening', 86, 'Referral'),
  ('00000000-0000-4000-8000-000000000103', '11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000201', 'Amara', 'Okafor', 'amara.okafor@example.com', 'Backend Engineer', 'interview', 91, 'Careers page'),
  ('00000000-0000-4000-8000-000000000104', '11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000201', 'Wei', 'Zhang', 'wei.zhang@example.com', 'Backend Engineer', 'offer', 94, 'Referral'),
  ('00000000-0000-4000-8000-000000000105', '11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000201', 'Ines', 'Marques', 'ines.marques@example.com', 'Backend Engineer', 'hired', 89, 'LinkedIn')
on conflict (id) do nothing;

-- Leave balances + requests
insert into public.leave_balances (id, employee_id, type, balance_days, used_days, year)
values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001', 'pto', 20, 6, 2025),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000001', 'sick', 10, 2, 2025)
on conflict (id) do nothing;

insert into public.leave_requests (id, organization_id, employee_id, employee_name, type, start_date, end_date, reason, status)
values
  ('00000000-0000-4000-8000-000000000401', '11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000004', 'Miguel Torres', 'pto', '2025-03-10', '2025-03-12', 'Family visit', 'pending'),
  ('00000000-0000-4000-8000-000000000402', '11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000002', 'Daniel Mbeki', 'sick', '2025-03-01', '2025-03-02', 'Flu', 'approved'),
  ('00000000-0000-4000-8000-000000000403', '11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000005', 'Priya Nair', 'pto', '2025-03-18', '2025-03-22', 'Annual leave', 'pending')
on conflict (id) do nothing;

-- Payroll runs + line items
insert into public.payroll_runs (id, organization_id, period_start, period_end, status, currency)
values
  ('00000000-0000-4000-8000-000000000501', '11111111-1111-4111-8111-111111111111', '2025-02-01', '2025-02-28', 'completed', 'USD'),
  ('00000000-0000-4000-8000-000000000502', '11111111-1111-4111-8111-111111111111', '2025-02-01', '2025-02-28', 'completed', 'EUR')
on conflict (id) do nothing;

insert into public.payroll_line_items (id, payroll_run_id, employee_id, employee_name, gross_pay, deductions, net_pay, currency)
values
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000001', 'Ayesha Rahman', 5000, 1000, 4000, 'USD'),
  ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000002', 'Daniel Mbeki', 6000, 1200, 4800, 'USD'),
  ('00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000003', 'Sofia Lindqvist', 4000, 800, 3200, 'EUR')
on conflict (id) do nothing;

-- Lead intelligence (CRM)
insert into public.leads (id, organization_id, first_name, last_name, email, company, title, source, status, score)
values
  ('00000000-0000-4000-8000-000000000701', '11111111-1111-4111-8111-111111111111', 'James', 'Carter', 'james.carter@acmecorp.com', 'Acme Corp', 'VP People', 'Inbound', 'qualified', 84),
  ('00000000-0000-4000-8000-000000000702', '11111111-1111-4111-8111-111111111111', 'Maya', 'Patel', 'maya.patel@northwind.io', 'Northwind', 'CTO', 'Referral', 'contacted', 71),
  ('00000000-0000-4000-8000-000000000703', '11111111-1111-4111-8111-111111111111', 'Lucas', 'Silva', 'lucas.silva@globex.com', 'Globex', 'Head of Talent', 'Outbound', 'proposal', 92),
  ('00000000-0000-4000-8000-000000000704', '11111111-1111-4111-8111-111111111111', 'Emma', 'Johnson', 'emma.johnson@initech.com', 'Initech', 'HR Director', 'Inbound', 'new', 55)
on conflict (id) do nothing;

insert into public.deals (id, organization_id, lead_id, name, value, currency, stage, probability, expected_close_date)
values
  ('00000000-0000-4000-8000-000000000801', '11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000701', 'Acme Corp — Enterprise', 48000, 'USD', 'proposal', 60, '2025-04-15'),
  ('00000000-0000-4000-8000-000000000802', '11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000703', 'Globex — Growth', 24000, 'USD', 'negotiation', 75, '2025-03-30')
on conflict (id) do nothing;

-- Google Workspace provisioning
insert into public.workspace_domains (id, organization_id, domain, provisioning_status, membership_policy, allow_personal_accounts)
values ('00000000-0000-4000-8000-000000000901', '11111111-1111-4111-8111-111111111111', 'fluxentiq.test', 'provisioned', 'require_membership', false)
on conflict (id) do nothing;
