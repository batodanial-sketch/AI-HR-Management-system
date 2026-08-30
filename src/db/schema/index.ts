import { drizzle } from "drizzle-orm/node-postgres";
import postgres from "@/db/postgres";
import * as recruitmentSchemas from "./recruitment";
import * as outreachSchemas from "./outreachSequence";

// Export all schemas for Drizzle ORM
export const schema = {
  ...recruitmentSchemas,
  ...outreachSchemas,
};

// Export Drizzle client
export const db = drizzle(postgres, { schema });

export type Schema = typeof schema;

export * from "./outreachSequence"; // Export types and relations for outreach sequences
export * from "./recruitment"; // Export types and relations for recruitment schemas