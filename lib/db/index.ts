import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

import { env } from "@/config/env";

// Node runtimes below v22 have no global WebSocket; polyfill so Pool can open sessions.
neonConfig.webSocketConstructor = ws;

const pool = new Pool({
  connectionString: env.DATABASE_URL!,
  max: 5, // cap concurrent connections per instance to avoid exhausting Neon's connection limit under serverless fan-out
  connectionTimeoutMillis: 30000, // fail fast instead of hanging forever waiting for a free connection
  idleTimeoutMillis: 10000, // proactively close idle clients before Neon's pooler drops them, so a frozen/thawed instance never hands out a stale socket
  statement_timeout: 60000, // kill runaway queries so they don't hold a connection open indefinitely
  query_timeout: 60000, // matching client-side timeout for the same reason
});

// Pool is an EventEmitter; an unlistened 'error' on an idle client (e.g. the
// pooler closing a stale connection) would otherwise crash the process.
pool.on("error", (err: Error) => {
  console.error("Unexpected error on idle Neon client", err);
});

export const db = drizzle({ client: pool, schema });
