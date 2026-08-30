import { pgTable, uuid, text, timestamp, integer, boolean, pgEnum, jsonb, foreignKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { candidates, jobOpenings } from "@/db/schema/recruitment";

// Enums
const outreachChannelEnum = pgEnum("outreach_channel", ["email", "linkedin", "sms"]);
const outreachStepStatusEnum = pgEnum("outreach_step_status", [
  "pending",
  "executed",
  "skipped",
  "failed",
]);

const outreachCampaignStatusEnum = pgEnum("outreach_campaign_status", [
  "active",
  "paused",
  "completed",
  "replied_halted",
  "cancelled",
]);

// Tables
// Outreach Campaigns
const outreachCampaigns = pgTable("outreach_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  candidateId: uuid("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").notNull().references(() => jobOpenings.id, { onDelete: "cascade" }),
  status: outreachCampaignStatusEnum("status").notNull().default("active"),
  currentStepIndex: integer("current_step_index").notNull().default(0),
  totalSteps: integer("total_steps").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  repliedAt: timestamp("replied_at"),
});

// Outreach Steps
const outreachSteps = pgTable("outreach_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => outreachCampaigns.id, { onDelete: "cascade" }),
  stepNumber: integer("step_number").notNull(),
  delayDays: integer("delay_days").notNull(),
  channel: outreachChannelEnum("channel").notNull(),
  subjectTemplate: text("subject_template").notNull(),
  bodyTemplate: text("body_template").notNull(),
  status: outreachStepStatusEnum("status").notNull().default("pending"),
  scheduledFor: timestamp("scheduled_for").notNull(),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Outreach Execution Logs
const outreachExecutionLogs = pgTable("outreach_execution_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => outreachCampaigns.id, { onDelete: "cascade" }),
  stepId: uuid("step_id").notNull().references(() => outreachSteps.id, { onDelete: "cascade" }),
  attemptNumber: integer("attempt_number").notNull().default(1),
  payload: jsonb("payload").notNull(),
  providerMessageId: text("provider_message_id"),
  error: text("error"),
  executedAt: timestamp("executed_at").notNull().defaultNow(),
});

// Relations
const outreachCampaignRelations = relations(outreachCampaigns, ({ one, many }) => ({
  candidate: one(candidates, {
    fields: [outreachCampaigns.candidateId],
    references: [candidates.id],
  }),
  job: one(jobOpenings, {
    fields: [outreachCampaigns.jobId],
    references: [jobOpenings.id],
  }),
  steps: many(outreachSteps),
  logs: many(outreachExecutionLogs),
}));

const outreachStepRelations = relations(outreachSteps, ({ one, many }) => ({
  campaign: one(outreachCampaigns, {
    fields: [outreachSteps.campaignId],
    references: [outreachCampaigns.id],
  }),
  logs: many(outreachExecutionLogs),
}));

const outreachExecutionLogRelations = relations(outreachExecutionLogs, ({ one }) => ({
  campaign: one(outreachCampaigns, {
    fields: [outreachExecutionLogs.campaignId],
    references: [outreachCampaigns.id],
  }),
  step: one(outreachSteps, {
    fields: [outreachExecutionLogs.stepId],
    references: [outreachSteps.id],
  }),
}));

export const outreachSequenceSchema = {
  outreachCampaigns,
  outreachSteps,
  outreachExecutionLogs,
  outreachCampaignRelations,
  outreachStepRelations,
  outreachExecutionLogRelations,
};

export type OutreachChannel = typeof outreachChannelEnum.enumValues[number];

export type OutreachStepStatus = typeof outreachStepStatusEnum.enumValues[number];

export type OutreachCampaignStatus = typeof outreachCampaignStatusEnum.enumValues[number];