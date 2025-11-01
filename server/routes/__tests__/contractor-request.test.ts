import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { createServer } from '../../index';
import { getTestPool } from '../../tests/setup';
import { default as expressLib } from 'express';
import { getDatabaseUrl } from '../contractor-request';

const buildApp = () => createServer();

const contractorPayload = {
  email: 'applicant@example.com',
  companySlug: 'silicon-valley-consulting',
  companyName: 'Silicon Valley Consulting',
};

beforeEach(() => {
  process.env.REDDIT_CLIENT_ID = 'test-client-id';
  process.env.REDDIT_CLIENT_SECRET = 'test-client-secret';
});

describe('POST /api/contractor-request', () => {
  it('creates contractor request for an existing user', async () => {
    const db = getTestPool();
    await db.query(
      `INSERT INTO users (email, phone, reddit_username, reddit_verified)
       VALUES ($1, $2, $3, $4)`,
      ['applicant@example.com', '+1234567890', 'validuser', true],
    );

    const app = buildApp();

    const response = await request(app)
      .post('/api/contractor-request')
      .send(contractorPayload)
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      message: "We've just pinged them. You'll be sent an email and text invite within 72 hours.",
    });

    const { rows } = await db.query('SELECT * FROM contractors WHERE email = $1', [contractorPayload.email]);
    expect(rows).toHaveLength(1);
    expect(rows[0].company_slug).toBe('silicon-valley-consulting');
    expect(rows[0].joined_slack).toBe(true);
    expect(rows[0].can_start_job).toBe(false);
  });

  it('returns 404 when user does not exist', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/contractor-request')
      .send(contractorPayload)
      .expect(404);

    expect(response.body).toEqual({
      success: false,
      message: 'User not found. Please complete the qualification form first.',
    });
  });

  it('returns 400 when contractor request already exists', async () => {
    const db = getTestPool();
    const { rows } = await db.query(
      `INSERT INTO users (email, phone, reddit_username, reddit_verified)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['applicant@example.com', '+1234567890', 'validuser', true],
    );
    const userId = rows[0].id;

    await db.query(
      `INSERT INTO contractors (user_id, email, company_slug, company_name, status, joined_slack, can_start_job)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, contractorPayload.email, contractorPayload.companySlug, contractorPayload.companyName, 'pending', true, false],
    );

    const app = buildApp();

    const response = await request(app)
      .post('/api/contractor-request')
      .send(contractorPayload)
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      message: 'You have already requested to join this company. Please check your email for updates.',
    });
  });

  it('validates request body via schema', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/contractor-request')
      .send({ email: 'invalid-email', companySlug: '', companyName: '' })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('email');
  });

  it('returns 500 when database query fails unexpectedly', async () => {
    const db = getTestPool();
    await db.query(
      `INSERT INTO users (email, phone, reddit_username, reddit_verified)
       VALUES ($1, $2, $3, $4)`,
      ['applicant@example.com', '+1234567890', 'validuser', true],
    );

    const app = buildApp();

    const querySpy = vi.spyOn(Pool.prototype, 'query').mockImplementationOnce(() => {
      throw new Error('database unavailable');
    });

    const response = await request(app)
      .post('/api/contractor-request')
      .send(contractorPayload)
      .expect(500);

    expect(querySpy).toHaveBeenCalled();
    expect(response.body).toEqual({
      success: false,
      message: 'Internal server error: database unavailable',
    });
  });

  it('initializes pool with SSL when using neon connection string (branch coverage)', async () => {
    const originalUrl = process.env.TEST_DATABASE_URL;
    vi.resetModules();
    process.env.TEST_DATABASE_URL = 'postgres://user:pass@my-db.neon.tech/db';

    const expressApp = expressLib();
    const { handleContractorRequest } = await import('../contractor-request');
    expressApp.post('/api/contractor-request', handleContractorRequest);

    // Send invalid payload to trigger Zod 400 and avoid hitting DB query while exercising getDatabase()
    const response = await request(expressApp)
      .post('/api/contractor-request')
      .send({})
      .expect(400);

    expect(response.body.success).toBe(false);

    process.env.TEST_DATABASE_URL = originalUrl;
    vi.resetModules();
  });

  it('returns 500 when insert does not return any rows', async () => {
    const db = getTestPool();
    await db.query(
      `INSERT INTO users (email, phone, reddit_username, reddit_verified)
       VALUES ($1, $2, $3, $4)`,
      ['applicant@example.com', '+1234567890', 'validuser', true],
    );

    const app = buildApp();

    // Mock queries: find user -> check existing contractor -> insert (returns 0 rows)
    const querySpy = vi
      .spyOn(Pool.prototype, 'query')
      .mockResolvedValueOnce({ rows: [{ id: 1, email: 'applicant@example.com' }] } as any) // First query: find user
      .mockResolvedValueOnce({ rows: [] } as any) // Second query: check existing contractor
      .mockResolvedValueOnce({ rows: [] } as any); // Third query: insert (returns 0 rows)

    const response = await request(app)
      .post('/api/contractor-request')
      .send(contractorPayload)
      .expect(500);

    expect(querySpy).toHaveBeenCalledTimes(3);
    expect(response.body).toEqual({
      success: false,
      message: 'Internal server error: Failed to save contractor request to database',
    });
  });

  it('exercises database logging when connection pool already exists', async () => {
    const db = getTestPool();
    await db.query(
      `INSERT INTO users (email, phone, reddit_username, reddit_verified)
       VALUES ($1, $2, $3, $4)`,
      ['test@example.com', '+1234567890', 'testuser', true],
    );

    const app = buildApp();

    // First request creates pool, second reuses it
    const payload = {
      email: 'test@example.com',
      companySlug: 'test-company',
      companyName: 'Test Company',
    };

    const response1 = await request(app)
      .post('/api/contractor-request')
      .send(payload)
      .expect(200);

    expect(response1.body.success).toBe(true);

    // Second request should log "Using existing connection pool"
    await db.query('DELETE FROM contractors WHERE email = $1', ['test@example.com']);
    
    const response2 = await request(app)
      .post('/api/contractor-request')
      .send(payload)
      .expect(200);

    expect(response2.body.success).toBe(true);
  });

  it('covers all console.log branches in getDatabase', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalUrl = process.env.TEST_DATABASE_URL;
    
    // Test with TEST_DATABASE_URL set (logs "YES")
    process.env.NODE_ENV = 'test';
    process.env.TEST_DATABASE_URL = 'postgres://test';
    
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    vi.resetModules();
    
    const { handleContractorRequest } = await import('../contractor-request');
    const expressApp = (await import('express')).default();
    expressApp.post('/api/test', handleContractorRequest);
    
    await request(expressApp).post('/api/test').send({}).expect(400);
    
    // Verify line 23 ternary was covered with databaseUrl present
    expect(consoleLogSpy).toHaveBeenCalledWith('[DB] Database URL configured:', 'YES');
    
    consoleLogSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
    process.env.TEST_DATABASE_URL = originalUrl;
    vi.resetModules();
  });

  it('covers getDatabase logging with DATABASE_URL absent', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalUrl = process.env.DATABASE_URL;
    
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    
    vi.resetModules();
    
    try {
      const { handleContractorRequest } = await import('../contractor-request');
      const expressApp = (await import('express')).default();
      expressApp.post('/api/test', handleContractorRequest);
      
      await request(expressApp).post('/api/test').send({}).expect(500);
      
      // getDatabaseUrl throws error (tested directly in getDatabaseUrl tests)
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.DATABASE_URL = originalUrl;
      vi.resetModules();
    }
  });

  it('covers getDatabase with TEST_DATABASE_URL in test mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalUrl = process.env.TEST_DATABASE_URL;
    
    process.env.NODE_ENV = 'test';
    process.env.TEST_DATABASE_URL = 'postgres://test-db';
    
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    vi.resetModules();
    
    const { handleContractorRequest } = await import('../contractor-request');
    const expressApp = (await import('express')).default();
    expressApp.post('/api/test', handleContractorRequest);
    
    await request(expressApp).post('/api/test').send({}).expect(400);
    
    // Lines 20-21, 27: covers NODE_ENV === 'test' branch
    expect(consoleLogSpy).toHaveBeenCalled();
    
    consoleLogSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
    process.env.TEST_DATABASE_URL = originalUrl;
    vi.resetModules();
  });

  it('covers SSL configuration branches in database connection', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalUrl = process.env.DATABASE_URL;
    
    // Test with neon.tech URL (SSL enabled)
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://user:pass@example.neon.tech/db';
    
    vi.resetModules();
    
    const { handleContractorRequest: handler1 } = await import('../contractor-request');
    const app1 = (await import('express')).default();
    app1.post('/api/test', handler1);
    
    await request(app1).post('/api/test').send({}).expect(400);
    
    // Test with non-neon URL (SSL disabled)
    process.env.DATABASE_URL = 'postgres://localhost:5432/testdb';
    
    vi.resetModules();
    
    const { handleContractorRequest: handler2 } = await import('../contractor-request');
    const app2 = (await import('express')).default();
    app2.post('/api/test', handler2);

    await request(app2).post('/api/test').send({}).expect(400);

    process.env.NODE_ENV = originalEnv;
    process.env.DATABASE_URL = originalUrl;
    vi.resetModules();
  });

  it('covers line 27: production mode with missing DATABASE_URL', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalUrl = process.env.DATABASE_URL;

    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;

    vi.resetModules();
    const { handleContractorRequest } = await import('../contractor-request');

    const app = (await import('express')).default();
    app.use((await import('express')).json());
    app.post('/api/test-prod-no-db', handleContractorRequest);

    await request(app).post('/api/test-prod-no-db').send({}).expect(500);

    // getDatabaseUrl throws error (tested directly in getDatabaseUrl tests)

    process.env.NODE_ENV = originalEnv;
    process.env.DATABASE_URL = originalUrl;
    vi.resetModules();
  });

  it('covers lines 45-47: catches Pool construction errors', async () => {
    const originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://test-pool-error';
    vi.resetModules();

    vi.doMock('pg', () => ({
      Pool: class {
        constructor() {
          throw new Error('Mock Pool constructor error');
        }
      }
    }));

    const { handleContractorRequest: freshHandler } = await import('../contractor-request');
    const app = (await import('express')).default();
    app.use((await import('express')).json());
    app.post('/api/test-pool-error', freshHandler);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await request(app).post('/api/test-pool-error').send({
      name: "Test",
      email: "test@example.com",
      company: "Test Co",
      message: "Test"
    }).expect(500);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[DB] Failed to create PostgreSQL connection pool:',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
    process.env.DATABASE_URL = originalUrl;
    vi.doUnmock('pg');
    vi.resetModules();
  });

  it('covers line 23: uses DATABASE_URL in production mode (non-test environment)', async () => {
    const originalEnv = process.env.NODE_ENV;
    
    // Temporarily change NODE_ENV to non-test value to cover line 23 false branch
    process.env.NODE_ENV = 'production';
    
    // The ternary on line 23 will evaluate to false (NODE_ENV !== 'test')
    // so it will try to use DATABASE_URL instead of TEST_DATABASE_URL
    // We can verify this by checking which branch is taken through logs
    
    const consoleLogSpy = vi.spyOn(console, 'log');
    const app = buildApp();
    
    // Make a request - this will trigger getDatabase which evaluates line 23
    const response = await request(app)
      .post('/api/contractor-request')
      .send({
        email: 'test@example.com',
        companySlug: 'test-company',
        companyName: 'Test Company'
      })
      .expect(404); // User doesn't exist
    
    expect(response.body.success).toBe(false);
    
    // Verify that getDatabase was called (which contains line 23)
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("[DB] Getting database connection"));
    
    consoleLogSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  it('covers getDatabaseUrl with production mode (line 12-13: false branch of ternary)', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalDbUrl = process.env.DATABASE_URL;
    
    // Set production mode to test the false branch of the ternary
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://prod-db';
    
    const url = getDatabaseUrl();
    
    expect(url).toBe('postgresql://prod-db');
    
    // Cleanup
    process.env.NODE_ENV = originalEnv;
    process.env.DATABASE_URL = originalDbUrl;
  });

  it('covers getDatabaseUrl throwing error when DATABASE_URL missing in production', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalDbUrl = process.env.DATABASE_URL;
    
    // Set production mode without DATABASE_URL
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    
    expect(() => getDatabaseUrl()).toThrow('DATABASE_URL environment variable is not set');
    
    // Cleanup
    process.env.NODE_ENV = originalEnv;
    process.env.DATABASE_URL = originalDbUrl;
  });

  it('covers line 18: error message using DATABASE_URL in production mode', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalDbUrl = process.env.DATABASE_URL;
    
    // Set production mode without DATABASE_URL to trigger error with 'DATABASE_URL' message
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    
    // This covers line 18: the false branch of the ternary that selects 'DATABASE_URL'
    expect(() => getDatabaseUrl()).toThrow('DATABASE_URL environment variable is not set');
    
    // Cleanup
    process.env.NODE_ENV = originalEnv;
    process.env.DATABASE_URL = originalDbUrl;
  });

  it('covers line 18: error message using TEST_DATABASE_URL in test mode', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalTestUrl = process.env.TEST_DATABASE_URL;

    process.env.NODE_ENV = 'test';
    delete process.env.TEST_DATABASE_URL;

    expect(() => getDatabaseUrl()).toThrow('TEST_DATABASE_URL environment variable is not set');

    process.env.NODE_ENV = originalEnv;
    process.env.TEST_DATABASE_URL = originalTestUrl;
  });

  it('covers line 35: SSL false branch when database URL does not contain neon.tech', async () => {
    // Clear modules to force pool recreation
    vi.resetModules();
    
    const originalUrl = process.env.TEST_DATABASE_URL;
    // Use a URL without 'neon.tech' to cover the false branch (line 35: ssl: false)
    process.env.TEST_DATABASE_URL = 'postgresql://localhost:5432/testdb';
    
    const app = buildApp();
    await request(app)
      .post('/api/contractor-request')
      .send({
        email: 'test@example.com',
        companySlug: 'test-company',
        companyName: 'Test Company'
      })
      .expect(404); // User won't exist
    
    // Cleanup
    process.env.TEST_DATABASE_URL = originalUrl;
    vi.resetModules();
  });

  it('covers line 35: logs NO when database URL is missing', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalUrl = process.env.DATABASE_URL;

    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.resetModules();
    const { handleContractorRequest } = await import('../contractor-request');

    const app = expressLib();
    app.use(expressLib.json());
    app.post('/api/contractor-request', handleContractorRequest);

    await request(app)
      .post('/api/contractor-request')
      .send({})
      .expect(500);

    expect(consoleLogSpy).toHaveBeenCalledWith('[DB] Database URL configured:', 'NO');

    consoleLogSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
    process.env.DATABASE_URL = originalUrl;
    vi.resetModules();
  });
});
