import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

// Initialize PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// Export the PostgreSQL client
const postgres = drizzle(pool);

export default postgres;
export { pool };