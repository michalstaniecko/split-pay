import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

/** Opens a connection pool. The caller owns the pool and must `end()` it. */
export const createDb = (url: string) => {
  const pool = new Pool({ connectionString: url });
  const db = drizzle({ client: pool, schema, casing: 'snake_case' });
  return { db, pool };
};

export type Db = ReturnType<typeof createDb>['db'];
