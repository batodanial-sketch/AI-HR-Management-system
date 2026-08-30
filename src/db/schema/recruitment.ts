import { pgTable, uuid, text, timestamp, integer, boolean, pgEnum, jsonb, foreignKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
const recruitmentStageEnum = pgEnum("recruitment_stage", [
  "applied",
  "screening",
  "interviewing",
  "offered",
  "hired",
  "rejected",
]);

// Tables
// Candidates
export const candidates = pgTable("candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  stage: recruitmentStageEnum("stage").notNull().default("applied"),
  matchScore: integer("match_score").notNull().default(0),
  source: text("source").notNull(),
  resumeUrl: text("resume_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Job Openings
export const jobOpenings = pgTable("job_openings", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  title: text("title").notNull(),
  department: text("department").notNull(),
  location: text("location").notNull(),
  description: text("description").notNull(),
  requirements: jsonb("requirements").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Relations
export const candidateRelations = relations(candidates, ({ one }) => ({
  organization: one(organizations, {
    fields: [candidates.organizationId],
    references: [organizations.id],
  }),
}));

export const jobOpeningRelations = relations(jobOpenings, ({ one }) => ({
  organization: one(organizations, {
    fields: [jobOpenings.organizationId],
    references: [organizations.id],
  }),
}));
