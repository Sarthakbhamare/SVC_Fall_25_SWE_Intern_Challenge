import { beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { Pool } from 'pg';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { newDb } from 'pg-mem';

type PgAdapterFactory = ReturnType<typeof newDb>['adapters']['createPg'];
type PgAdapter = ReturnType<PgAdapterFactory> | null;

const hoisted = vi.hoisted(() => {
  let adapter: PgAdapter = null;

  return {
    setAdapter(value: PgAdapter) {
      adapter = value;
    },
    getAdapter() {
      return adapter;
    },
  };
}) as {
  setAdapter: (value: PgAdapter) => void;
  getAdapter: () => PgAdapter;
};

vi.mock('pg', async () => {
  const adapter = hoisted.getAdapter();

  if (adapter) {
    return adapter;
  }

  return vi.importActual<typeof import('pg')>('pg');
});

let container: StartedPostgreSqlContainer | null = null;
let pool: Pool;
let usingInMemoryDatabase = false;
let inMemoryDb: ReturnType<typeof newDb> | null = null;

const truncateTables = async () => {
  if (!pool) {
    return;
  }

  await pool.query('TRUNCATE contractors RESTART IDENTITY CASCADE;');
  await pool.query('TRUNCATE users RESTART IDENTITY CASCADE;');
};

const initializeDatabase = async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = '';
  process.env.PING_MESSAGE = 'test ping';
  process.env.REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID ?? 'test-client-id';
  process.env.REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET ?? 'test-client-secret';

  try {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('svc_test')
      .withUsername('svc_user')
      .withPassword('svc_pass')
      .start();

    const connectionUri = container.getConnectionUri();
    process.env.TEST_DATABASE_URL = connectionUri;

    const { Pool: PgPool } = await import('pg');
    pool = new PgPool({ connectionString: connectionUri }) as Pool;
  } catch (error) {
    usingInMemoryDatabase = true;
    console.warn('⚠️  Falling back to in-memory PostgreSQL for tests:', error);
    inMemoryDb = newDb({ autoCreateForeignKeyIndices: true });
    const adapter = inMemoryDb.adapters.createPg();
    hoisted.setAdapter(adapter);

    const { Pool: InMemoryPool } = await import('pg');
    pool = new InMemoryPool() as Pool;
    process.env.TEST_DATABASE_URL = 'pg-mem://svc/internal';
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      reddit_username TEXT NOT NULL,
      twitter_username TEXT,
      youtube_username TEXT,
      facebook_username TEXT,
      reddit_verified BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS contractors (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      company_slug TEXT NOT NULL,
      company_name TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      joined_slack BOOLEAN DEFAULT false,
      can_start_job BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await truncateTables();
};

const initialization = initializeDatabase();

export const getTestPool = () => {
  if (!pool) {
    throw new Error('Test database pool is not initialised');
  }

  return pool;
};

beforeAll(async () => {
  await initialization;
});

afterEach(async () => {
  await truncateTables();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await truncateTables();

  if (pool) {
    await pool.end();
  }

  if (container && !usingInMemoryDatabase) {
    await container.stop();
  }

  if (usingInMemoryDatabase) {
    hoisted.setAdapter(null);
    inMemoryDb = null;
  }
});
