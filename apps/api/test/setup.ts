import { afterAll, beforeEach } from 'vitest';
import { testDb, truncateAll } from './db';

beforeEach(truncateAll);
afterAll(() => testDb.pool.end());
