import { useMemo, useState } from 'react'
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, Bot, BrainCircuit, BriefcaseBusiness,
  Building2, CalendarDays, ChartNoAxesCombined, Check, CheckCircle2, ChevronDown,
  ChevronRight, CircleAlert, Clock3, Command, Download, FileText, Filter, LayoutDashboard,
  LineChart, ListFilter, LogOut, Menu, Moon, MoreHorizontal, PanelTopClose, Plus,
  RefreshCw, Search, Send, Settings2, ShieldCheck, Sparkles, Sun, Target, TrendingUp,
  UserPlus, Users, WalletCards, Workflow, X, Zap, CircleDollarSign, Database,
  GitPullRequestArrow, SlidersHorizontal
} from 'lucide-react'
import { downloadXlsx } from './exporters.js'

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'employees', label: 'Employees', icon: Users },
  { id: 'recruitment', label: 'Recruitment', icon: BriefcaseBusiness },
  { id: 'screening', label: 'AI Screening', icon: BrainCircuit, badge: 'AI' },
  { id: 'attendance', label: 'Attendance', icon: Clock3 },
  { id: 'payroll', label: 'Payroll', icon: WalletCards },
  { id: 'leave', label: 'Leave Management', icon: CalendarDays },
  { id: 'performance', label: 'Performance', icon: Target },
  { id: 'assistant', label: 'AI HR Assistant', icon: Bot }
]

const baseEmployees = [
  { id: 'EMP-101', name: 'Alex Mercer', initials: 'AM', title: 'Senior AI Automation Engineer', department: 'Engineering', compensation: 155000, performance: 94, risk: 'Low Risk', status: 'Active', email: 'alex.mercer@fluxentiq.ai' },
  { id: 'EMP-102', name: 'Sarah Chen', initials: 'SC', title: 'Principal UI/UX Designer', department: 'Design', compensation: 135000, performance: 88, risk: 'Low Risk', status: 'Active', email: 'sarah.chen@fluxentiq.ai' },
  { id: 'EMP-103', name: 'Marcus Webb', initials: 'MW', title: 'Senior Product Manager', department: 'Product', compensation: 148000, performance: 85, risk: 'Low Risk', status: 'Active', email: 'marcus.webb@fluxentiq.ai' },
  { id: 'EMP-104', name: 'Elena Vasquez', initials: 'EV', title: 'ML Engineer', department: 'Data & AI', compensation: 162000, performance: 90, risk: 'Low Risk', status: 'Active', email: 'elena.vasquez@fluxentiq.ai' },
  { id: 'EMP-105', name: 'Priya Shah', initials: 'PS', title: 'People Analytics Lead', department: 'People Operations', compensation: 122000, performance: 86, risk: 'Low Risk', status: 'Active', email: 'priya.shah@fluxentiq.ai' },
  { id: 'EMP-106', name: 'Jordan Blake', initials: 'JB', title: 'Platform Reliability Engineer', department: 'Engineering', compensation: 130000, performance: 85, risk: 'Action Required', status: 'Active', email: 'jordan.blake@fluxentiq.ai' }
]

const toneMap = {
  success: 'border-emerald-400/15 bg-emerald-400/10 text-emerald-300',
  warning: 'border-amber-400/15 bg-amber-400/10 text-amber-300',
  danger: 'border-rose-400/15 bg-rose-400/10 text-rose-300',
  indigo: 'border-indigo-400/15 bg-indigo-400/10 text-indigo-200',
  slate: 'border-white/8 bg-white/[0.035] text-slate-300'
}

const formatMoney = value => `$${Math.round(value).toLocaleString()}`
const initials = name => name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()
const avatarTone = name => ['from-violet-500/70 to-indigo-500/70', 'from-cyan-500/65 to-blue-500/65', 'from-fuchsia-500/65 to-violet-500/65', 'from-sky-500/65 to-indigo-500/65'][[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4]
const cn = (...values) => values.filter(Boolean).join(' ')

function Avatar({ name, size = 'md' }) {
  const dimensions = size === 'sm' ? 'h-7 w-7 text-[9px]' : size === 'lg' ? 'h-12 w-12 text-sm' : 'h-8 w-8 text-[10px]'
  return <span className={cn('grid shrink-0 place-items-center rounded-lg bg-gradient-to-br font-bold text-white ring-1 ring-white/10 transition-all duration-300 ease-in-out hover:scale-105', dimensions, avatarTone(name))}>{initials(name)}</span>
}

function StatusPill({ tone = 'slate', children }) {
  return <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold leading-none transition-all duration-300 ease-in-out', toneMap[tone])}><i className="h-1.5 w-1.5 rounded-full bg-current" />{children}</span>
}

function ActionButton({ children, icon: Icon, variant = 'secondary', className, ...props }) {
  const variants = {
    secondary: 'border border-white/8 bg-white/[0.035] text-slate-300 hover:border-white/15 hover:bg-white/[0.07] hover:text-white',
    primary: 'border border-indigo-400/20 bg-indigo-600 text-white hover:-translate-y-0.5 hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/10',
    ghost: 'border border-transparent bg-transparent text-slate-400 hover:bg-white/5 hover:text-white',
    danger: 'border border-rose-400/20 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15'
  }
  return <button className={cn('inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-[11px] font-semibold transition-all duration-300 ease-in-out disabled:cursor-not-allowed disabled:opacity-50', variants[variant], className)} {...props}>{Icon && <Icon size={15} strokeWidth={1.8} />}{children}</button>
}

function IconButton({ label, children, className, ...props }) {
  return <button aria-label={label} title={label} className={cn('relative grid h-9 w-9 place-items-center rounded-md border border-transparent text-slate-400 transition-all duration-300 ease-in-out hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-indigo-500/60', className)} {...props}>{children}</button>
}

function Toasts({ toasts, dismiss }) {
  return <div className="fixed right-5 top-5 z-[90] grid w-[min(360px,calc(100vw-40px))] gap-2">{toasts.map(toast => <div key={toast.id} className="flex items-start gap-3 rounded-lg border border-white/8 bg-[#111629]/95 p-3 shadow-2xl shadow-black/30 backdrop-blur-xl animate-in slide-in-from-right-3 duration-300"><span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-md', toast.tone === 'danger' ? 'bg-rose-500/10 text-rose-300' : toast.tone === 'warning' ? 'bg-amber-500/10 text-amber-300' : 'bg-emerald-500/10 text-emerald-300')}>{toast.tone === 'danger' ? <CircleAlert size={15} /> : <CheckCircle2 size={15} />}</span><div className="min-w-0 flex-1"><p className="text-[11px] font-semibold text-white">{toast.title}</p><p className="mt-0.5 text-[10px] leading-4 text-slate-400">{toast.message}</p></div><button onClick={() => dismiss(toast.id)} className="text-slate-500 transition-colors duration-200 hover:text-white"><X size={14}/></button></div>)}</div>
}

function Modal({ title, subtitle, children, onClose, wide = false }) {
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4 backdrop-blur-md" onMouseDown={onClose}><section onMouseDown={event => event.stopPropagation()} className={cn('max-h-[calc(100vh-32px)] w-full overflow-y-auto rounded-lg border border-white/10 bg-[#0f1425]/95 shadow-2xl shadow-black/50 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-300', wide ? 'max-w-3xl' : 'max-w-xl')}><header className="flex items-start justify-between border-b border-white/6 px-5 py-4"><div><h2 className="text-sm font-bold tracking-tight text-white">{title}</h2>{subtitle && <p className="mt-1 text-[11px] text-slate-400">{subtitle}</p>}</div><IconButton label="Close modal" onClick={onClose}><X size={18}/></IconButton></header>{children}</section></div>
}

function Sidebar({ activeView, onNavigate, isOpen, close }) {
  return <>
    <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-white/5 bg-[#090b16]/95 px-3 pb-3 pt-4 backdrop-blur-2xl transition-transform duration-300 ease-in-out lg:translate-x-0', isOpen ? 'translate-x-0' : '-translate-x-full')}>
      <button onClick={() => onNavigate('dashboard')} className="group mx-1 flex items-center rounded-md p-1.5 text-left transition-all duration-300 ease-in-out hover:scale-105 hover:drop-shadow-[0_0_8px_rgba(99,102,241,0.8)] hover:opacity-95">
        <img src="/brand/fluxentiq-wordmark.png" alt="Fluxentiq AI HR Management" className="h-auto w-[171px] transition-all duration-300 ease-in-out group-hover:brightness-110"/>
      </button>
      <p className="mb-2 mt-7 px-3 text-[9px] font-extrabold tracking-[0.14em] text-slate-600">NAVIGATION CORE</p>
      <nav className="grid gap-1">{navItems.map(item => { const Icon = item.icon; const active = activeView === item.id; return <button key={item.id} onClick={() => onNavigate(item.id)} className={cn('relative flex h-10 items-center gap-3 rounded-md px-3 text-left text-[11px] font-medium transition-all duration-300 ease-in-out hover:bg-white/5 hover:text-white', active ? 'bg-gradient-to-r from-indigo-500/15 to-violet-500/5 text-white shadow-[inset_2px_0_0_#818cf8]' : 'text-slate-400')}><Icon size={16} strokeWidth={1.8} className={active ? 'text-indigo-300' : 'text-slate-500 transition-colors duration-300 group-hover:text-slate-300'}/><span className="flex-1">{item.label}</span>{item.badge && <span className="rounded-md border border-indigo-300/15 bg-indigo-500/10 px-1.5 py-0.5 text-[8px] font-bold text-indigo-200">{item.badge}</span>}</button> })}</nav>
      <div className="mt-auto border-t border-white/5 px-1 pt-3"><div className="flex items-center justify-between rounded-md border border-violet-300/10 bg-white/[0.025] p-2.5 transition-all duration-300 ease-in-out hover:border-violet-300/20 hover:bg-white/[0.04]"><div><div className="flex items-center gap-1.5 text-[9px] font-semibold text-slate-300"><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400"/>Fluxentiq Engine</div><p className="mt-1 text-[9px] text-violet-300">v2.4 Autonomous</p></div><img src="/brand/fluxentiq-mark.png" className="h-7 w-7 rounded-md border border-violet-300/20 object-cover" alt="Fluxentiq engine"/></div><div className="mt-2 flex items-center gap-2 rounded-md px-2 py-2 transition-all duration-300 ease-in-out hover:bg-white/5"><Avatar name="Daniyal" size="sm"/><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold text-slate-200">Daniyal</p><p className="text-[9px] text-slate-500">System Admin</p></div><MoreHorizontal size={15} className="text-slate-500"/></div></div>
    </aside>
    {isOpen && <button aria-label="Close navigation" onClick={close} className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"/>}
  </>
}

function Topbar({ activeLabel, onQuickAction, notifications, onNotifications, dark, toggleDark }) {
  return <header className="sticky top-0 z-20 flex h-[74px] items-center justify-between border-b border-white/5 bg-[#090d16]/85 px-4 backdrop-blur-xl lg:px-8"><div className="flex items-center gap-3"><div className="hidden items-center gap-2 text-[10px] lg:flex"><span className="uppercase tracking-[0.12em] text-slate-600">Navigation Core</span><ChevronRight size={13} className="text-slate-700"/><strong className="text-slate-300">{activeLabel}</strong></div></div><div className="flex items-center gap-1.5"><label className="hidden h-9 w-[min(360px,32vw)] items-center gap-2 rounded-md border border-white/7 bg-white/[0.025] px-3 text-slate-500 transition-all duration-300 ease-in-out focus-within:border-indigo-400/30 focus-within:bg-white/[0.04] md:flex"><Search size={15}/><input placeholder="Search candidates, personnel, logs..." className="min-w-0 flex-1 bg-transparent text-[11px] text-slate-200 outline-none placeholder:text-slate-600"/><kbd className="rounded border border-white/8 px-1.5 py-0.5 text-[8px] text-slate-500">⌘K</kbd></label><IconButton label="Toggle dark mode" onClick={toggleDark}>{dark ? <Sun size={16}/> : <Moon size={16}/>}</IconButton><ActionButton variant="primary" icon={Plus} className="hidden sm:inline-flex" onClick={onQuickAction}>Quick Action</ActionButton><IconButton label="Notifications" onClick={onNotifications}><Bell size={16}/>{notifications.some(item => !item.read) && <i className="absolute right-2 top-2 h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400 ring-2 ring-[#090d16]"/>}</IconButton><div className="ml-1 flex items-center gap-2 rounded-md px-1.5 py-1 transition-all duration-300 ease-in-out hover:bg-white/5"><Avatar name="Daniyal" size="sm"/><div className="hidden sm:block"><p className="text-[10px] font-semibold text-slate-200">Daniyal</p><p className="text-[8px] text-slate-500">System Admin</p></div></div></div></header>
}

function Dashboard({ employees, setEmployees, payrollStage, setPayrollStage, openNewEmployee, openAdjustComp, notify, setActiveView }) {
  const [tab, setTab] = useState('Directory')
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('All Departments')
  const [status, setStatus] = useState('All Statuses')
  const annualBurn = useMemo(() => employees.reduce((sum, employee) => sum + employee.compensation, 0), [employees])
  const avgPerformance = useMemo(() => Math.round(employees.reduce((sum, employee) => sum + employee.performance, 0) / employees.length), [employees])
  const riskCount = useMemo(() => employees.filter(employee => employee.risk !== 'Low Risk').length, [employees])
  const departments = useMemo(() => [...new Set(employees.map(employee => employee.department))], [employees])
  const filtered = useMemo(() => employees.filter(employee => {
    const text = `${employee.name} ${employee.id} ${employee.title} ${employee.email} ${employee.department}`.toLowerCase()
    return (!query || text.includes(query.toLowerCase())) && (department === 'All Departments' || employee.department === department) && (status === 'All Statuses' || employee.status === status)
  }), [employees, query, department, status])
  const exportCSV = () => {
    const rows = [['Employee Contract', 'Department', 'Compensation', 'Performance', 'AI Risk Audit', 'Status'], ...employees.map(employee => [`${employee.name} (${employee.id})`, employee.department, employee.compensation, employee.performance, employee.risk, employee.status])]
    const blob = new Blob([rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'fluxentiq-workforce-command.csv'; anchor.click(); URL.revokeObjectURL(url)
    notify('CSV export ready', 'The workforce command export has started downloading.', 'success')
  }
  const advancePayroll = () => {
    if (payrollStage === 'Ready for Review') { setPayrollStage('Review'); notify('Q3 payroll validated', 'Payroll moved to finance review with all policy checks logged.', 'success') }
    else if (payrollStage === 'Review') { setPayrollStage('Approved'); notify('Q3 payroll approved', 'Cycle is locked and ready to be marked as paid.', 'success') }
    else if (payrollStage === 'Approved') { setPayrollStage('Paid'); notify('Q3 cycle paid', 'Payment notifications were queued for all contracts.', 'success') }
    else notify('Q3 payroll already paid', 'Create the next cycle to continue.', 'warning')
  }
  const toggleStatus = employee => {
    setEmployees(items => items.map(item => item.id === employee.id ? { ...item, status: item.status === 'Active' ? 'Inactive' : 'Active' } : item))
    notify('Employee status updated', `${employee.name} is now ${employee.status === 'Active' ? 'Inactive' : 'Active'}.`, 'success')
  }
  return <div className="mx-auto w-full max-w-[1534px] space-y-5 px-4 py-7 sm:px-6 lg:px-8">
    <section className="flex flex-col gap-5 border-b border-white/7 pb-6 xl:flex-row xl:items-end xl:justify-between"><div><span className="inline-flex items-center gap-2 text-[9px] font-extrabold tracking-[0.13em] text-emerald-300"><i className="h-1.5 w-1.5 rounded-full bg-emerald-400"/>FLUXENTIQ ENGINE ACTIVE</span><h1 className="mt-3 text-3xl font-bold tracking-[-0.045em] text-white sm:text-[34px]">HR Control &amp; Workforce Command</h1><p className="mt-2 max-w-3xl text-[12px] leading-5 text-slate-400">Orchestrate enterprise talent, monitor autonomous workflows, and deploy predictive AI retention strategies.</p></div><div className="flex flex-wrap gap-2"><ActionButton icon={Download} onClick={exportCSV}>Export CSV</ActionButton><ActionButton icon={Plus} onClick={openNewEmployee}>New Employee</ActionButton><ActionButton variant="primary" icon={CircleDollarSign} onClick={advancePayroll}>{payrollStage === 'Ready for Review' ? 'Run Q3 Payroll Cycle' : payrollStage === 'Review' ? 'Approve Q3 Payroll' : payrollStage === 'Approved' ? 'Mark Q3 Cycle Paid' : 'Q3 Cycle Paid'}</ActionButton></div></section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="TOTAL HEADCOUNT" value={employees.length} foot="+14.2%" footTone="success" icon={TrendingUp}/><Metric label="ANNUAL PAYROLL BURN" value={`$${Math.round(annualBurn / 1000)}k`} foot={`$${Math.round(annualBurn / 12).toLocaleString()} / mo`} icon={WalletCards}/><Metric label="AVG PERFORMANCE SCORE" value={`${avgPerformance}%`} foot="Top Tier" footTone="success" icon={CheckCircle2}/><Metric label="ATTRITION RISK INDEX" value={riskCount} foot="Action Required" footTone="danger" icon={CircleAlert}/></section>
    <section className="overflow-hidden rounded-lg border border-white/5 bg-white/[0.025] backdrop-blur-xl"><div className="flex overflow-x-auto border-b border-white/6 bg-black/10 px-4"><Tab label={`Directory (${employees.length})`} active={tab === 'Directory'} onClick={() => setTab('Directory')}/><Tab label="AI Copilot" active={tab === 'AI Copilot'} onClick={() => setTab('AI Copilot')}/><Tab label="ATS Pipeline" active={tab === 'ATS Pipeline'} onClick={() => setTab('ATS Pipeline')}/><Tab label="n8n Logs" active={tab === 'n8n Logs'} onClick={() => setTab('n8n Logs')}/></div>
      {tab === 'Directory' && <><div className="flex flex-col gap-2 border-b border-white/6 p-4 md:flex-row"><label className="flex h-9 flex-1 items-center gap-2 rounded-md border border-white/7 bg-black/20 px-3 text-slate-500 transition-all duration-300 ease-in-out focus-within:border-indigo-400/35 focus-within:bg-white/[0.035]"><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Filter by employee name, email, or job title..." className="w-full bg-transparent text-[11px] text-slate-200 outline-none placeholder:text-slate-600"/></label><select value={department} onChange={event => setDepartment(event.target.value)} className="h-9 rounded-md border border-white/7 bg-black/20 px-3 text-[10px] text-slate-300 outline-none transition-all duration-300 ease-in-out hover:border-white/15"><option>All Departments</option>{departments.map(item => <option key={item}>{item}</option>)}</select><select value={status} onChange={event => setStatus(event.target.value)} className="h-9 rounded-md border border-white/7 bg-black/20 px-3 text-[10px] text-slate-300 outline-none transition-all duration-300 ease-in-out hover:border-white/15"><option>All Statuses</option><option>Active</option><option>Inactive</option></select></div><div className="overflow-x-auto"><table className="w-full min-w-[1020px] border-collapse"><thead><tr className="border-b border-white/6 bg-black/10 text-left text-[8px] font-extrabold tracking-[0.12em] text-slate-600"><th className="px-5 py-3">EMPLOYEE CONTRACT</th><th className="px-4 py-3">DEPARTMENT</th><th className="px-4 py-3">COMPENSATION</th><th className="px-4 py-3">AI RISK AUDIT</th><th className="px-4 py-3">STATUS</th><th className="px-5 py-3 text-right">ACTIONS</th></tr></thead><tbody>{filtered.map(employee => <tr key={employee.id} className="border-b border-white/5 transition-colors duration-300 ease-in-out hover:bg-white/[0.02]"><td className="px-5 py-4"><div className="flex items-center gap-3"><Avatar name={employee.name}/><div><p className="text-[11px] font-semibold text-slate-100">{employee.name} <code className="ml-1 text-[8px] font-normal text-slate-600">{employee.id}</code></p><p className="mt-0.5 text-[9px] text-slate-500">{employee.title}</p></div></div></td><td className="px-4 py-4"><span className="inline-flex items-center gap-1.5 text-[10px] text-slate-300"><Building2 size={13} className="text-indigo-300/80"/>{employee.department}</span></td><td className="px-4 py-4"><p className="text-[10px] font-semibold text-slate-200">{formatMoney(employee.compensation)}/yr</p><p className="mt-0.5 text-[9px] text-slate-500">Perf: {employee.performance}/100</p></td><td className="px-4 py-4"><StatusPill tone={employee.risk === 'Low Risk' ? 'success' : 'danger'}>{employee.risk}</StatusPill></td><td className="px-4 py-4"><StatusPill tone={employee.status === 'Active' ? 'success' : 'slate'}>{employee.status}</StatusPill></td><td className="px-5 py-4"><div className="flex justify-end gap-1.5"><button onClick={() => toggleStatus(employee)} className="rounded-md border border-white/8 bg-white/[0.03] px-2 py-1.5 text-[8px] font-bold text-slate-400 transition-all duration-300 ease-in-out hover:border-indigo-400/40 hover:bg-indigo-500/10 hover:text-indigo-100">{employee.status === 'Active' ? 'Toggle Status' : 'Activate'}</button><button onClick={() => openAdjustComp(employee)} className="rounded-md border border-white/8 bg-white/[0.03] px-2 py-1.5 text-[8px] font-bold text-slate-400 transition-all duration-300 ease-in-out hover:border-indigo-400/40 hover:bg-indigo-500/10 hover:text-indigo-100">Adjust Comp</button></div></td></tr>)}</tbody></table></div></>}
      {tab === 'AI Copilot' && <CommandTab icon={Bot} title="Fluxentiq Autonomous Copilot" text="Retention risk is low across five contracts. Jordan Blake requires a manager check-in due to workload pattern drift." primary="Generate retention action plan" secondary="Open AI HR Assistant" onPrimary={() => notify('Retention plan created', 'A manager check-in and workload review workflow are ready.', 'success')} onSecondary={() => setActiveView('assistant')}/>}
      {tab === 'ATS Pipeline' && <div className="grid min-h-[300px] grid-cols-2 gap-4 p-6 md:grid-cols-3 xl:grid-cols-6">{[['APPLIED',28,100],['SCREENING',14,68],['SHORTLISTED',7,45],['INTERVIEW',4,28],['OFFER',2,16],['HIRED',1,10]].map(([label,value,width]) => <div key={label} className="flex flex-col justify-end rounded-md border border-white/5 bg-black/10 p-4 transition-all duration-300 ease-in-out hover:-translate-y-1 hover:border-indigo-400/20"><span className="text-[8px] font-bold tracking-[0.1em] text-slate-600">{label}</span><strong className="mt-3 text-2xl font-bold text-white">{value}</strong><i className="mt-4 h-1.5 rounded-sm bg-indigo-500" style={{width:`${width}%`}}/></div>)}</div>}
      {tab === 'n8n Logs' && <div className="divide-y divide-white/5">{[['16:42:18','workflow.applicant-screening','succeeded','Resume score persisted for Priya Nair','success'],['16:31:04','workflow.leave-routing','succeeded','Approval request routed to manager','success'],['16:08:55','workflow.payroll-notify','waiting','Awaiting Q3 approval trigger','warning'],['15:52:11','workflow.retention-signal','warning','Attrition risk alert logged for Jordan Blake','danger']].map(([time,flow,state,message,tone]) => <div key={`${time}-${flow}`} className="grid gap-2 px-5 py-4 transition-colors duration-300 ease-in-out hover:bg-white/[0.02] md:grid-cols-[90px_1.15fr_110px_1.5fr]"><code className="text-[9px] text-slate-600">{time}</code><strong className="text-[10px] font-medium text-slate-300">{flow}</strong><StatusPill tone={tone}>{state}</StatusPill><span className="text-[10px] text-slate-500">{message}</span></div>)}</div>}
    </section>
  </div>
}

function Metric({ label, value, foot, footTone, icon: Icon }) {
  return <article className="group rounded-lg border border-white/5 bg-white/[0.025] p-4 backdrop-blur-xl transition-all duration-300 ease-in-out hover:-translate-y-1 hover:border-indigo-400/20 hover:shadow-lg hover:shadow-indigo-500/10"><div className="flex items-start justify-between"><span className="text-[9px] font-extrabold tracking-[0.11em] text-slate-600">{label}</span><Icon size={15} className="text-slate-600 transition-colors duration-300 group-hover:text-indigo-300"/></div><strong className="mt-5 block text-[27px] font-bold tracking-[-0.05em] text-white">{value}</strong><span className={cn('mt-2 inline-flex items-center gap-1 text-[9px] font-semibold', footTone === 'success' ? 'text-emerald-300' : footTone === 'danger' ? 'text-rose-300' : 'text-slate-500')}>{footTone === 'success' && <ArrowUpRight size={12}/>} {footTone === 'danger' && <CircleAlert size={12}/>} {foot}</span></article>
}

function Tab({ label, active, onClick }) { return <button onClick={onClick} className={cn('relative h-11 px-3 text-[11px] font-semibold transition-all duration-300 ease-in-out hover:text-white', active ? 'text-white' : 'text-slate-500')}>{label}{active && <i className="absolute inset-x-3 bottom-0 h-0.5 bg-indigo-400"/>}</button> }

function CommandTab({ icon: Icon, title, text, primary, secondary, onPrimary, onSecondary }) { return <div className="flex min-h-[340px] items-center justify-center p-8"><div className="flex max-w-xl items-start gap-4"><span className="grid h-11 w-11 place-items-center rounded-md border border-indigo-400/15 bg-indigo-500/10 text-indigo-200"><Icon size={20}/></span><div><h3 className="text-base font-bold text-white">{title}</h3><p className="mt-2 text-[11px] leading-5 text-slate-400">{text}</p><div className="mt-5 flex flex-wrap gap-2"><ActionButton variant="primary" onClick={onPrimary}>{primary}</ActionButton><ActionButton onClick={onSecondary}>{secondary}</ActionButton></div></div></div></div> }

function EnterpriseModule({ title, eyebrow, description, icon: Icon, action, children }) { return <div className="mx-auto w-full max-w-[1534px] px-4 py-7 sm:px-6 lg:px-8"><div className="mb-6 flex flex-col justify-between gap-4 border-b border-white/6 pb-5 sm:flex-row sm:items-end"><div><span className="text-[9px] font-extrabold tracking-[0.12em] text-indigo-300">{eyebrow}</span><h1 className="mt-2 text-3xl font-bold tracking-[-0.045em] text-white">{title}</h1><p className="mt-2 max-w-2xl text-[12px] text-slate-400">{description}</p></div>{action}</div><div className="grid gap-4 lg:grid-cols-[1.3fr_.7fr]"><section className="rounded-lg border border-white/5 bg-white/[0.025] p-5 backdrop-blur-xl transition-all duration-300 ease-in-out hover:border-indigo-400/15"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-md border border-indigo-400/15 bg-indigo-500/10 text-indigo-200"><Icon size={19}/></span><div><h3 className="text-sm font-semibold text-white">{title} workspace</h3><p className="mt-1 text-[10px] text-slate-500">Operational controls, context-aware automation and audit-ready state.</p></div></div>{children || <div className="mt-6 grid gap-3 sm:grid-cols-2"><MiniCard label="Active signals" value="12"/><MiniCard label="Governed actions" value="98%"/><MiniCard label="Review queue" value="4"/><MiniCard label="Automation health" value="Healthy"/></div>}</section><aside className="rounded-lg border border-white/5 bg-white/[0.02] p-5 backdrop-blur-xl"><p className="text-[9px] font-bold tracking-[0.1em] text-slate-600">SYSTEM STATUS</p><div className="mt-4 space-y-3">{[['Policy controls','Enforced'],['Audit logging','Active'],['AI guardrails','Operational'],['Human review','Required']].map(([label,value]) => <div key={label} className="flex items-center justify-between border-b border-white/5 pb-3 text-[10px]"><span className="text-slate-500">{label}</span><span className="inline-flex items-center gap-1 text-emerald-300"><i className="h-1.5 w-1.5 rounded-full bg-emerald-400"/>{value}</span></div>)}</div></aside></div></div> }

function MiniCard({ label, value }) { return <div className="rounded-md border border-white/6 bg-black/15 p-4 transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:bg-white/[0.03]"><p className="text-[9px] text-slate-600">{label}</p><strong className="mt-2 block text-lg text-white">{value}</strong></div> }

function AddEmployeeModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({ name:'', title:'', department:'Engineering', compensation:'100000' })
  const submit = event => { event.preventDefault(); if (!form.name.trim() || !form.title.trim()) return; onSubmit(form) }
  return <Modal title="New Employee Contract" subtitle="Create an employee record and attach it to the workforce command." onClose={onClose}><form onSubmit={submit} className="p-5"><div className="grid gap-4"><Field label="Full legal name"><input value={form.name} onChange={event => setForm({...form,name:event.target.value})} autoFocus placeholder="Employee name" className="h-10 w-full rounded-md border border-white/8 bg-black/20 px-3 text-[11px] text-slate-100 outline-none transition-all duration-300 ease-in-out placeholder:text-slate-600 focus:border-indigo-400/50 focus:bg-white/[0.035]"/></Field><Field label="Job title"><input value={form.title} onChange={event => setForm({...form,title:event.target.value})} placeholder="Role title" className="h-10 w-full rounded-md border border-white/8 bg-black/20 px-3 text-[11px] text-slate-100 outline-none transition-all duration-300 ease-in-out placeholder:text-slate-600 focus:border-indigo-400/50 focus:bg-white/[0.035]"/></Field><Field label="Department"><select value={form.department} onChange={event => setForm({...form,department:event.target.value})} className="h-10 w-full rounded-md border border-white/8 bg-black/20 px-3 text-[11px] text-slate-100 outline-none transition-all duration-300 ease-in-out placeholder:text-slate-600 focus:border-indigo-400/50 focus:bg-white/[0.035]"><option>Engineering</option><option>Design</option><option>Product</option><option>Data & AI</option><option>People Operations</option></select></Field><Field label="Annual compensation"><input value={form.compensation} onChange={event => setForm({...form,compensation:event.target.value})} type="number" className="h-10 w-full rounded-md border border-white/8 bg-black/20 px-3 text-[11px] text-slate-100 outline-none transition-all duration-300 ease-in-out placeholder:text-slate-600 focus:border-indigo-400/50 focus:bg-white/[0.035]"/></Field></div><footer className="mt-6 flex justify-end gap-2"><ActionButton onClick={onClose}>Cancel</ActionButton><ActionButton variant="primary" icon={UserPlus} type="submit">Create Employee</ActionButton></footer></form></Modal>
}

function AdjustCompModal({ employee, onClose, onSave }) {
  const [value, setValue] = useState(employee.compensation)
  return <Modal title={`Adjust Compensation · ${employee.name}`} subtitle="This action is logged and will appear in the next payroll validation cycle." onClose={onClose}><form onSubmit={event => { event.preventDefault(); onSave(value) }} className="p-5"><Field label="Annual compensation (USD)"><input className="h-10 w-full rounded-md border border-white/8 bg-black/20 px-3 text-[11px] text-slate-100 outline-none transition-all duration-300 ease-in-out placeholder:text-slate-600 focus:border-indigo-400/50 focus:bg-white/[0.035]" type="number" value={value} onChange={event => setValue(event.target.value)}/></Field><div className="mt-4 rounded-md border border-indigo-400/10 bg-indigo-500/5 p-3 text-[10px] leading-4 text-slate-400"><ShieldCheck size={14} className="mr-2 inline text-indigo-300"/> Compensation adjustments require a human approval record.</div><footer className="mt-6 flex justify-end gap-2"><ActionButton onClick={onClose}>Cancel</ActionButton><ActionButton variant="primary" type="submit">Save Adjustment</ActionButton></footer></form></Modal>
}

function NotificationPanel({ items, onClose }) { return <Modal title="Notifications" subtitle="Operational events and governed workflow outcomes." onClose={onClose}><div className="max-h-[430px] divide-y divide-white/5 overflow-y-auto">{items.length ? items.map(item => <div key={item.id} className="flex gap-3 p-4"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-indigo-500/10 text-indigo-300"><Bell size={14}/></span><div><p className="text-[11px] font-semibold text-slate-200">{item.title}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{item.message}</p></div></div>) : <div className="p-8 text-center text-[11px] text-slate-500">No unread operational events.</div>}</div><footer className="flex justify-end border-t border-white/6 p-4"><ActionButton variant="primary" onClick={onClose}>Mark all read</ActionButton></footer></Modal> }

function Field({ label, children }) { return <label className="grid gap-1.5 text-[10px] font-semibold text-slate-400"><span>{label}</span>{children}</label> }

export default function App() {
  const [activeView, setActiveView] = useState('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dark, setDark] = useState(true)
  const [employees, setEmployees] = useState(baseEmployees)
  const [payrollStage, setPayrollStage] = useState('Ready for Review')
  const [modal, setModal] = useState(null)
  const [toasts, setToasts] = useState([])
  const [notifications, setNotifications] = useState([{ id:'n1', title:'Attrition signal detected', message:'Jordan Blake requires a manager check-in based on workload pattern drift.', read:false }, { id:'n2', title:'Payroll validation complete', message:'Q3 payroll controls are ready for review.', read:false }])
  const notify = (title, message, tone = 'success') => { const id = `${Date.now()}-${Math.random()}`; const item = { id, title, message, tone }; setToasts(items => [...items, item]); setNotifications(items => [{ ...item, read:false }, ...items]); setTimeout(() => setToasts(items => items.filter(toast => toast.id !== id)), 3800) }
  const navigate = view => { setActiveView(view); setMobileOpen(false) }
  const activeLabel = navItems.find(item => item.id === activeView)?.label || 'Dashboard'
  const addEmployee = form => { const employee = { id:`EMP-${100 + employees.length + 1}`, name:form.name, initials:initials(form.name), title:form.title, department:form.department, compensation:Number(form.compensation), performance:82, risk:'Low Risk', status:'Active', email:`${form.name.toLowerCase().replace(/\s+/g,'.')}@fluxentiq.ai` }; setEmployees(items => [...items, employee]); setModal(null); notify('Employee contract created', `${employee.name} joined the workforce command directory.`) }
  const adjustCompensation = value => { const employee = modal.employee; setEmployees(items => items.map(item => item.id === employee.id ? { ...item, compensation:Number(value) } : item)); setModal(null); notify('Compensation updated', `${employee.name}'s annual compensation was updated.`) }
  const dashboard = <Dashboard employees={employees} setEmployees={setEmployees} payrollStage={payrollStage} setPayrollStage={setPayrollStage} openNewEmployee={() => setModal({ type:'newEmployee' })} openAdjustComp={employee => setModal({ type:'adjustComp', employee })} notify={notify} setActiveView={navigate}/>
  const modules = {
    employees: <EnterpriseModule title="Employees" eyebrow="WORKFORCE / DIRECTORY" description="Manage employee contracts, compensation, performance signals and governance controls." icon={Users} action={<ActionButton variant="primary" icon={Plus} onClick={() => setModal({type:'newEmployee'})}>New Employee</ActionButton>}/>,
    recruitment: <EnterpriseModule title="Recruitment" eyebrow="TALENT / APPLICANT TRACKING" description="Govern candidate pipelines, autonomous match scoring and structured interview operations." icon={BriefcaseBusiness} action={<ActionButton variant="primary" icon={Plus}>Create Requisition</ActionButton>}/>,
    screening: <EnterpriseModule title="AI Screening" eyebrow="TALENT / EVIDENCE ENGINE" description="Score resumes against governed role policies and route high-confidence applicants." icon={BrainCircuit} action={<ActionButton variant="primary" icon={Sparkles}>Analyze Resume</ActionButton>}/>,
    attendance: <EnterpriseModule title="Attendance" eyebrow="OPERATIONS / TIME SIGNALS" description="Monitor workforce presence, verified check-ins and payroll-ready timesheets." icon={Clock3} action={<ActionButton variant="primary" icon={Clock3}>Check In</ActionButton>}/>,
    payroll: <EnterpriseModule title="Payroll" eyebrow="OPERATIONS / COMPENSATION" description="Validate compensation, exceptions and approval controls before payment execution." icon={WalletCards} action={<ActionButton variant="primary" icon={CircleDollarSign}>Open Payroll Cycle</ActionButton>}/>,
    leave: <EnterpriseModule title="Leave Management" eyebrow="OPERATIONS / TIME OFF" description="Manage balances, coverage impact and policy-aware approval routing." icon={CalendarDays} action={<ActionButton variant="primary" icon={Plus}>Request Leave</ActionButton>}/>,
    performance: <EnterpriseModule title="Performance" eyebrow="TALENT / PERFORMANCE" description="Align goals, evidence, manager feedback and governed AI summaries." icon={Target} action={<ActionButton variant="primary" icon={Sparkles}>Generate Review Insight</ActionButton>}/>,
    assistant: <EnterpriseModule title="AI HR Assistant" eyebrow="INTELLIGENCE / COPILOT" description="Ask Fluxentiq for context-aware, policy-bound workforce guidance." icon={Bot} action={<ActionButton variant="primary" icon={Send}>New Conversation</ActionButton>}/>
  }
  return <div className={cn('min-h-screen font-sans transition-colors duration-300 ease-in-out', dark ? 'bg-[#090D16] text-slate-100' : 'bg-slate-100 text-slate-900')}>
    <Sidebar activeView={activeView} onNavigate={navigate} isOpen={mobileOpen} close={() => setMobileOpen(false)}/>
    <main className="min-h-screen lg:pl-[260px]"><Topbar activeLabel={activeLabel} onQuickAction={() => setModal({type:'newEmployee'})} notifications={notifications} onNotifications={() => setModal({type:'notifications'})} dark={dark} toggleDark={() => setDark(!dark)}/><button onClick={() => setMobileOpen(true)} className="fixed bottom-5 left-5 z-20 grid h-11 w-11 place-items-center rounded-md border border-white/10 bg-[#111629] text-white shadow-xl shadow-black/30 transition-all duration-300 ease-in-out hover:scale-105 lg:hidden"><Menu size={18}/></button>{activeView === 'dashboard' ? dashboard : modules[activeView]}</main>
    {modal?.type === 'newEmployee' && <AddEmployeeModal onClose={() => setModal(null)} onSubmit={addEmployee}/>} {modal?.type === 'adjustComp' && <AdjustCompModal employee={modal.employee} onClose={() => setModal(null)} onSave={adjustCompensation}/>} {modal?.type === 'notifications' && <NotificationPanel items={notifications} onClose={() => { setNotifications(items => items.map(item => ({...item,read:true}))); setModal(null) }}/>}<Toasts toasts={toasts} dismiss={id => setToasts(items => items.filter(item => item.id !== id))}/>
  </div>
}
