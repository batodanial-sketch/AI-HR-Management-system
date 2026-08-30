"use client";

import * as React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  Filter,
  Download,
  Send,
  Eye,
  MessageSquare,
  Users,
  TrendingUp,
  BarChart,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Bar,
  LineChart,
  Line,
} from "recharts";

// --- Types ---
type DateRange = "7D" | "30D" | "90D" | "YTD";
type OutreachChannel = "All" | "Email" | "LinkedIn" | "SMS";

interface DailyTrendData {
  date: string;
  sent: number;
  replies: number;
}

interface KpiData {
  totalSent: number;
  totalDelivered: number;
  deliveryRate: number;
  deliveryTrend: number;
  uniqueOpens: number;
  openRate: number;
  openTrend: number;
  responseCount: number;
  responseRate: number;
  positiveInterest: number;
  responseTrend: number;
  screeningsScheduled: number;
  conversionRate: number;
  conversionTrend: number;
}

interface FunnelData {
  name: string;
  value: number;
  percentage: number;
}

interface ChannelEffectiveness {
  channel: OutreachChannel;
  openRate: number;
  responseTime: number; // in hours
  conversionRate: number;
}

interface AiTemplatePerformance {
  templateAction: string;
  tone: string;
  openRate: number;
  responseRate: number;
  avgResponseTime: number; // in hours
}

interface DashboardData {
  kpis: KpiData;
  dailyTrends: DailyTrendData[];
  funnel: FunnelData[];
  channelEffectiveness: ChannelEffectiveness[];
  aiTemplateLeaderboard: AiTemplatePerformance[];
}

// --- Mock Data Generator ---
const generateMockData = (dateRange: DateRange): DashboardData => {
  const now = new Date();
  let daysToGenerate = 0;
  switch (dateRange) {
    case "7D":
      daysToGenerate = 7;
      break;
    case "30D":
      daysToGenerate = 30;
      break;
    case "90D":
      daysToGenerate = 90;
      break;
    case "YTD":
      daysToGenerate = now.getMonth() * 30 + now.getDate(); // Rough estimate for YTD
      break;
  }

  const dailyTrends: DailyTrendData[] = [];
  for (let i = daysToGenerate - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateString = d.toISOString().split("T")[0];
    const sent = Math.floor(Math.random() * 100) + 50;
    const replies = Math.floor(Math.random() * (sent * 0.4)) + (sent * 0.1);
    dailyTrends.push({
      date: dateString,
      sent,
      replies: Math.round(replies),
    });
  }

  const totalSent = dailyTrends.reduce((sum, d) => sum + d.sent, 0);
  const totalDelivered = Math.round(totalSent * (0.95 + Math.random() * 0.04)); // 95-99%
  const deliveryRate = (totalDelivered / totalSent) * 100;
  const uniqueOpens = Math.round(totalDelivered * (0.6 + Math.random() * 0.1)); // 60-70%
  const openRate = (uniqueOpens / totalDelivered) * 100;
  const responseCount = Math.round(uniqueOpens * (0.2 + Math.random() * 0.15)); // 20-35%
  const responseRate = (responseCount / uniqueOpens) * 100;
  const positiveInterest = Math.round(responseCount * (0.7 + Math.random() * 0.2)); // 70-90% positive
  const screeningsScheduled = Math.round(responseCount * (0.4 + Math.random() * 0.1)); // 40-50% conversion from response
  const conversionRate = (screeningsScheduled / totalSent) * 100;

  // Simple trend calculation
  const generateTrend = () => (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 5 + 1); // +/- 1-6%

  const kpis: KpiData = {
    totalSent,
    totalDelivered,
    deliveryRate: parseFloat(deliveryRate.toFixed(1)),
    deliveryTrend: parseFloat(generateTrend().toFixed(1)),
    uniqueOpens,
    openRate: parseFloat(openRate.toFixed(1)),
    openTrend: parseFloat(generateTrend().toFixed(1)),
    responseCount,
    responseRate: parseFloat(responseRate.toFixed(1)),
    positiveInterest: parseFloat(((positiveInterest / responseCount) * 100).toFixed(0)),
    responseTrend: parseFloat(generateTrend().toFixed(1)),
    screeningsScheduled,
    conversionRate: parseFloat(conversionRate.toFixed(1)),
    conversionTrend: parseFloat(generateTrend().toFixed(1)),
  };

  const funnel: FunnelData[] = [
    { name: "Sent", value: totalSent, percentage: 100 },
    { name: "Opened", value: uniqueOpens, percentage: parseFloat((openRate * deliveryRate / 100).toFixed(0)) },
    { name: "Replied", value: responseCount, percentage: parseFloat((responseRate * openRate * deliveryRate / 10000).toFixed(0)) },
    { name: "Screen Scheduled", value: screeningsScheduled, percentage: parseFloat((conversionRate).toFixed(0)) },
    { name: "Offer Extended", value: Math.round(screeningsScheduled * (0.2 + Math.random() * 0.1)), percentage: parseFloat((Math.round(screeningsScheduled * (0.2 + Math.random() * 0.1)) / totalSent * 100).toFixed(0)) },
  ].map(stage => ({ ...stage, percentage: Math.min(100, Math.max(0, stage.percentage)) })); // Ensure percentages are between 0 and 100

  const channelEffectiveness: ChannelEffectiveness[] = [
    { channel: "Email", openRate: 68.5, responseTime: 24, conversionRate: 15.2 },
    { channel: "LinkedIn", openRate: 55.1, responseTime: 12, conversionRate: 18.5 },
    { channel: "SMS", openRate: 85.3, responseTime: 2, conversionRate: 10.1 },
  ];

  const aiTemplateLeaderboard: AiTemplatePerformance[] = [
    { templateAction: "Initial Pitch", tone: "formal", openRate: 60.1, responseRate: 25.5, avgResponseTime: 30 },
    { templateAction: "Screening Invitation", tone: "direct", openRate: 72.8, responseRate: 45.1, avgResponseTime: 18 },
    { templateAction: "Rejection Nudge", tone: "startup-casual", openRate: 50.5, responseRate: 10.3, avgResponseTime: 48 },
  ];

  return {
    kpis,
    dailyTrends,
    funnel,
    channelEffectiveness,
    aiTemplateLeaderboard,
  };
};

// --- Custom Tooltip for Recharts ---
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-md border border-slate-700 bg-slate-800/80 p-3 shadow-lg backdrop-blur-xl">
        <p className="text-sm text-slate-200">{label}</p>
        {payload.map((p: any, index: number) => (
          <p key={index} className="text-xs text-slate-300" style={{ color: p.color }}>
            {p.name}: <span className="font-semibold">{p.value}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// --- Main Component ---
export function OutreachAnalyticsDashboard() {
  const [dateRange, setDateRange] = useState<DateRange>("30D");
  const [jobRequisition, setJobRequisition] = useState<string>("All");
  const [recruiter, setRecruiter] = useState<string>("All");
  const [outreachChannel, setOutreachChannel] = useState<OutreachChannel>("All");
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    setIsLoading(true);
    // Simulate data fetching
    const timer = setTimeout(() => {
      setData(generateMockData(dateRange));
      setIsLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, [dateRange, jobRequisition, recruiter, outreachChannel]); // Depend on filters for dynamic data

  const handleExportReport = useCallback(() => {
    // Dummy function for exporting data
    console.log("Exporting report...");
    // In a real app, this would trigger a download (e.g., using Blob and URL.createObjectURL)
  }, []);

  const renderTrendBadge = (value: number) => {
    const isPositive = value >= 0;
    return (
      <Badge
        variant={isPositive ? "success" : "destructive"}
        className="ml-2 text-xs font-semibold"
      >
        {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        {Math.abs(value)}%
      </Badge>
    );
  };

  if (isLoading || !data) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6 p-6 bg-slate-950 text-slate-100 min-h-screen"
      >
        <motion.div
          className="h-12 w-full bg-slate-800 rounded-md animate-pulse"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="h-[150px] bg-slate-800 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="h-[400px] bg-slate-800 animate-pulse" />
          <Card className="h-[400px] bg-slate-800 animate-pulse" />
        </div>
        <Card className="h-[300px] bg-slate-800 animate-pulse" />
      </motion.div>
    );
  }

  const { kpis, dailyTrends, funnel, channelEffectiveness, aiTemplateLeaderboard } = data;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 p-6 bg-slate-950 text-slate-100 min-h-screen"
    >
      {/* Global Control Bar */}
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="flex flex-col md:flex-row items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-2">
            {([
              { label: "Last 7 Days", value: "7D" },
              { label: "Last 30 Days", value: "30D" },
              { label: "Last 90 Days", value: "90D" },
              { label: "Year to Date", value: "YTD" },
            ] as const).map((range) => (
              <Button
                key={range.value}
                variant={dateRange === range.value ? "secondary" : "ghost"}
                onClick={() => setDateRange(range.value)}
                className="text-xs md:text-sm"
              >
                {range.label}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Select value={jobRequisition} onValueChange={setJobRequisition}>
              <SelectTrigger className="w-[180px] bg-slate-800 border-slate-700 text-slate-300">
                <SelectValue placeholder="Job Requisition" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                <SelectItem value="All">All Job Reqs</SelectItem>
                <SelectItem value="frontend-dev">Frontend Dev</SelectItem>
                <SelectItem value="backend-eng">Backend Eng</SelectItem>
                <SelectItem value="product-mgr">Product Manager</SelectItem>
              </SelectContent>
            </Select>
            <Select value={recruiter} onValueChange={setRecruiter}>
              <SelectTrigger className="w-[180px] bg-slate-800 border-slate-700 text-slate-300">
                <SelectValue placeholder="Recruiter/Agent" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                <SelectItem value="All">All Recruiters</SelectItem>
                <SelectItem value="ai-agent">AI Agent</SelectItem>
                <SelectItem value="human-recruiter">Human Recruiter</SelectItem>
              </SelectContent>
            </Select>
            <Select value={outreachChannel} onValueChange={setOutreachChannel}>
              <SelectTrigger className="w-[150px] bg-slate-800 border-slate-700 text-slate-300">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                <SelectItem value="All">All Channels</SelectItem>
                <SelectItem value="Email">Email</SelectItem>
                <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                <SelectItem value="SMS">SMS</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleExportReport} className="bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-700">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Top-Line KPI Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Total Sent & Delivered</CardTitle>
            <Send className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center">
              {kpis.totalSent.toLocaleString()}
              {renderTrendBadge(kpis.deliveryTrend)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {kpis.deliveryRate}% Delivered ({kpis.totalDelivered.toLocaleString()} unique)
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Open & Impression Rate</CardTitle>
            <Eye className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center">
              {kpis.openRate}%
              {renderTrendBadge(kpis.openTrend)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {kpis.uniqueOpens.toLocaleString()} Unique Opens
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Response Rate</CardTitle>
            <MessageSquare className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center">
              {kpis.responseRate}%
              {renderTrendBadge(kpis.responseTrend)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {kpis.positiveInterest}% Positive Interest ({kpis.responseCount.toLocaleString()} replies)
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Candidate Conversion</CardTitle>
            <Users className="h-4 w-4 text-violet-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center">
              {kpis.conversionRate}%
              {renderTrendBadge(kpis.conversionTrend)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {kpis.screeningsScheduled.toLocaleString()} Screenings Scheduled
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Primary Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="lg:col-span-3 bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-200">Outreach & Response Trends</CardTitle>
            <CardDescription className="text-slate-400">Daily Sent Messages vs. Daily Replies</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="date"
                  minTickGap={30}
                  tickFormatter={(str) => new Date(str).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  stroke="#64748B"
                  tick={{ fill: "#94A3B8", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis yAxisId="left" stroke="#64748B" tick={{ fill: "#94A3B8", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" stroke="#64748B" tick={{ fill: "#94A3B8", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="sent"
                  stroke="#6366F1"
                  fill="url(#colorSent)"
                  name="Sent Messages"
                  strokeWidth={2}
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="replies"
                  stroke="#10B981"
                  fill="url(#colorReplies)"
                  name="Replies"
                  strokeWidth={2}
                />
                <defs>
                  <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorReplies" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-200">Recruitment Pipeline Conversion</CardTitle>
            <CardDescription className="text-slate-400">Stages & Drop-offs</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={funnel}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" stroke="#64748B" tick={{ fill: "#94A3B8", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" stroke="#64748B" tick={{ fill: "#94A3B8", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" fill="#A78BFA" name="Candidates" />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 text-center text-sm text-slate-400">
              {funnel.map((stage, index) => (
                <span key={index} className="mr-4">
                  {stage.name}: {stage.percentage}%
                  {index < funnel.length - 1 && <span className="ml-1 text-slate-600">➔</span>}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Performance Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-200">Channel Effectiveness</CardTitle>
            <CardDescription className="text-slate-400">Open, Response, & Conversion Rates by Channel</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={channelEffectiveness}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="channel" stroke="#64748B" tick={{ fill: "#94A3B8", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748B" tick={{ fill: "#94A3B8", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="openRate" fill="#6366F1" name="Open Rate %" />
                <Bar dataKey="conversionRate" fill="#10B981" name="Conversion Rate %" />
                <Bar dataKey="responseTime" fill="#F59E0B" name="Avg Response Time (hrs)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-200">AI Tone & Template Leaderboard</CardTitle>
            <CardDescription className="text-slate-400">Top Performing Outreach Configurations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left table-auto">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="py-2 px-4 text-sm font-medium text-slate-300">Template/Action</th>
                    <th className="py-2 px-4 text-sm font-medium text-slate-300">Tone</th>
                    <th className="py-2 px-4 text-sm font-medium text-slate-300">Open Rate</th>
                    <th className="py-2 px-4 text-sm font-medium text-slate-300">Response Rate</th>
                    <th className="py-2 px-4 text-sm font-medium text-slate-300">Avg Response Time</th>
                  </tr>
                </thead>
                <tbody>
                  {aiTemplateLeaderboard.map((item, index) => (
                    <tr key={index} className="border-b border-slate-800 last:border-b-0">
                      <td className="py-3 px-4 text-sm">{item.templateAction}</td>
                      <td className="py-3 px-4 text-sm">{item.tone}</td>
                      <td className="py-3 px-4 text-sm text-emerald-500">{item.openRate}%</td>
                      <td className="py-3 px-4 text-sm text-indigo-500">{item.responseRate}%</td>
                      <td className="py-3 px-4 text-sm text-amber-500">{item.avgResponseTime}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}