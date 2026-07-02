import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

import { env } from "@/config/env";

const pool = new Pool({
  connectionString: env.DATABASE_URL!,
  max: 5, // cap concurrent connections per instance to avoid exhausting Neon's connection limit under serverless fan-out
  connectionTimeoutMillis: 30000, // fail fast instead of hanging forever waiting for a free connection
  statement_timeout: 60000, // kill runaway queries so they don't hold a connection open indefinitely
  query_timeout: 60000, // matching client-side timeout for the same reason
});

export const db = drizzle({ client: pool, schema });
