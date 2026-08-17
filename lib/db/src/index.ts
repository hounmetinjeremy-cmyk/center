import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

/**
 * Cloudflare Workers cannot read `process.env` the way Node.js can — env
 * vars/bindings are only available inside the request handler. This factory
 * lets callers (e.g. the api-server Worker) create a `db` instance per
 * request using `env.HYPERDRIVE.connectionString` (Cloudflare Hyperdrive)
 * or, when running locally in Node, `process.env.DATABASE_URL`.
 */
export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  return drizzle(pool, { schema });
}

export * from "./schema";
