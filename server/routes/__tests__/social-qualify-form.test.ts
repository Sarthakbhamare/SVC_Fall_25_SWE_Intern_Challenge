import request from 'supertest';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { createServer } from '../../index';
import { getTestPool } from '../../tests/setup';

const buildApp = () => createServer();

const mockSuccessfulRedditVerification = () => {
  const tokenResponse = {
    ok: true,
    status: 200,
    json: async () => ({ access_token: 'token' }),
    text: async () => '{"access_token":"token"}',
  } as const;

  const userResponse = {
    ok: true,
    status: 200,
    json: async () => ({ data: { name: 'verified-user' } }),
    text: async () => '{"data":{"name":"verified-user"}}',
  } as const;

  const fetchMock = vi.fn()
    .mockResolvedValueOnce(tokenResponse)
    .mockResolvedValueOnce(userResponse);

  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

  return fetchMock;
};

const mockFailedRedditVerification = (status = 404) => {
  const tokenResponse = {
    ok: true,
    status: 200,
    json: async () => ({ access_token: 'token' }),
    text: async () => '{"access_token":"token"}',
  } as const;

  const userResponse = {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => '',
  } as const;

  const fetchMock = vi.fn()
    .mockResolvedValueOnce(tokenResponse)
    .mockResolvedValueOnce(userResponse);

  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

  return fetchMock;
};

const validPayload = {
  email: 'applicant@example.com',
  phone: '+12345678901',
  redditUsername: 'validuser',
  twitterUsername: 'twuser',
  youtubeUsername: 'ytuser',
  facebookUsername: 'fbuser',
};

beforeEach(() => {
  process.env.REDDIT_CLIENT_ID = 'test-client-id';
  process.env.REDDIT_CLIENT_SECRET = 'test-client-secret';
});

describe('POST /api/social-qualify-form', () => {
  it('stores a new applicant when Reddit verification succeeds', async () => {
    const fetchMock = mockSuccessfulRedditVerification();
    const app = buildApp();

    const response = await request(app)
      .post('/api/social-qualify-form')
      .send(validPayload)
      .expect(200);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.body).toEqual({
      success: true,
      message: 'Application processed successfully',
      data: {
        matchedCompany: {
          name: 'Silicon Valley Consulting',
          slug: 'silicon-valley-consulting',
          payRate: '$2.00 per hour',
          bonus: '$500',
        },
      },
    });

    const { rows } = await getTestPool().query('SELECT * FROM users WHERE email = $1', [validPayload.email]);
    expect(rows).toHaveLength(1);
    expect(rows[0].reddit_verified).toBe(true);
  });

  it('persists optional social handles as null when omitted', async () => {
    mockSuccessfulRedditVerification();
    const app = buildApp();

    const minimalPayload = {
      email: 'no-handles@example.com',
      phone: '+15555555555',
      redditUsername: 'validuser',
    };

    const response = await request(app)
      .post('/api/social-qualify-form')
      .send(minimalPayload)
      .expect(200);

    expect(response.body.success).toBe(true);

    const { rows } = await getTestPool().query(
      'SELECT twitter_username, youtube_username, facebook_username FROM users WHERE email = $1',
      [minimalPayload.email],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      twitter_username: null,
      youtube_username: null,
      facebook_username: null,
    });
  });

  it('rejects duplicate applicants with same email and phone', async () => {
    mockSuccessfulRedditVerification();
    const db = getTestPool();
    await db.query(
      `INSERT INTO users (email, phone, reddit_username, reddit_verified)
       VALUES ($1, $2, $3, $4)`,
      [validPayload.email, validPayload.phone, validPayload.redditUsername, true],
    );

    const app = buildApp();

    const response = await request(app)
      .post('/api/social-qualify-form')
      .send(validPayload)
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      message: 'A user with this email and phone number combination already exists.',
    });
  });

  it('returns 400 when Reddit account cannot be verified', async () => {
    mockFailedRedditVerification(404);
    const app = buildApp();

    const response = await request(app)
      .post('/api/social-qualify-form')
      .send(validPayload)
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      message: "Reddit user 'validuser' does not exist. Please check the username and try again.",
    });
  });

  it('returns 400 when Reddit credentials are missing', async () => {
    delete process.env.REDDIT_CLIENT_ID;
    delete process.env.REDDIT_CLIENT_SECRET;

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const app = buildApp();

    const response = await request(app)
      .post('/api/social-qualify-form')
      .send(validPayload)
      .expect(400);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith('[REDDIT] Missing:', 'REDDIT_CLIENT_ID REDDIT_CLIENT_SECRET');
    expect(response.body).toEqual({
      success: false,
      message: "Reddit user 'validuser' does not exist. Please check the username and try again.",
    });

    consoleErrorSpy.mockRestore();
  });

  it('rejects malformed JSON payload when provided as Buffer', async () => {
    const fetchMock = mockSuccessfulRedditVerification();
    const app = buildApp();

    const response = await request(app)
      .post('/api/social-qualify-form')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('not-json'))
      .expect(400);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.body).toEqual({
      success: false,
      message: 'Invalid JSON in request body',
    });
  });

  it('accepts payload delivered as Buffer', async () => {
    const fetchMock = mockSuccessfulRedditVerification();
    const app = buildApp();

    const response = await request(app)
      .post('/api/social-qualify-form')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from(JSON.stringify(validPayload)))
      .expect(200);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.body.success).toBe(true);
  });

  it('accepts payload delivered as string', async () => {
    const fetchMock = mockSuccessfulRedditVerification();
    const app = buildApp();

    const response = await request(app)
      .post('/api/social-qualify-form')
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(validPayload))
      .expect(200);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.body.success).toBe(true);
  });

  it('returns 500 when database interaction fails unexpectedly', async () => {
    mockSuccessfulRedditVerification();
    const app = buildApp();

    const querySpy = vi.spyOn(Pool.prototype, 'query').mockImplementationOnce(() => {
      throw new Error('Database offline');
    });

    const response = await request(app)
      .post('/api/social-qualify-form')
      .send(validPayload)
      .expect(500);

    expect(querySpy).toHaveBeenCalled();
    expect(response.body).toEqual({
      success: false,
      message: 'Internal server error: Database offline',
    });
  });

  it('returns 400 when Reddit OAuth token cannot be obtained', async () => {
    const tokenResponse = {
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => 'unauthorized',
    } as const;

    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse);
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const app = buildApp();

    const response = await request(app)
      .post('/api/social-qualify-form')
      .send(validPayload)
      .expect(400);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.body).toEqual({
      success: false,
      message: "Reddit user 'validuser' does not exist. Please check the username and try again.",
    });
  });

  it('returns 500 when insert does not return any rows', async () => {
    // Successful reddit verification
    mockSuccessfulRedditVerification();
    const app = buildApp();

    // First query (existing user check) -> no rows; Second query (insert) -> no rows returned
    const querySpy = vi
      .spyOn(Pool.prototype, 'query')
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const response = await request(app)
      .post('/api/social-qualify-form')
      .send(validPayload)
      .expect(500);

    expect(querySpy).toHaveBeenCalledTimes(2);
    expect(response.body).toEqual({
      success: false,
      message: 'Internal server error: Failed to save user to database',
    });
  });
});

describe('POST /api/social-qualify-form without database URL', () => {
  it('fails fast when TEST_DATABASE_URL is not configured', async () => {
    const originalUrl = process.env.TEST_DATABASE_URL;
    delete process.env.TEST_DATABASE_URL;
    vi.resetModules();

    const { createServer: freshCreateServer } = await import('../../index');
    const app = freshCreateServer();

    const response = await request(app)
      .post('/api/social-qualify-form')
      .send(validPayload)
      .expect(500);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('Server error:');
    expect(response.body.message).toContain('TEST_DATABASE_URL environment variable is not set');

    process.env.TEST_DATABASE_URL = originalUrl;
    vi.resetModules();
  });

  it('initializes pool with SSL when using neon connection string (branch coverage)', async () => {
    // Ensure module isolation so the route file reads env anew
    const originalUrl = process.env.TEST_DATABASE_URL;
    vi.resetModules();
    process.env.TEST_DATABASE_URL = 'postgres://user:pass@my-db.neon.tech/db';

    const expressApp = (await import('express')).default();
    const { handleSocialQualifyForm } = await import('../social-qualify-form');
    expressApp.post('/api/social-qualify-form', handleSocialQualifyForm);

    // Trigger Zod validation error to avoid actual DB query while exercising getDatabase()
    const response = await request(expressApp)
      .post('/api/social-qualify-form')
      .send({})
      .expect(400);

    expect(response.body.success).toBe(false);

    process.env.TEST_DATABASE_URL = originalUrl;
    vi.resetModules();
  });

  it('exercises database logging when connection pool already exists', async () => {
    mockSuccessfulRedditVerification();
    const app = buildApp();

    // First request creates pool
    const response1 = await request(app)
      .post('/api/social-qualify-form')
      .send({ ...validPayload, email: 'first@example.com' })
      .expect(200);

    expect(response1.body.success).toBe(true);

    // Second request should log "Using existing connection pool"
    mockSuccessfulRedditVerification();
    const response2 = await request(app)
      .post('/api/social-qualify-form')
      .send({ ...validPayload, email: 'second@example.com', phone: '+19999999999' })
      .expect(200);

    expect(response2.body.success).toBe(true);
  });

  it('handles Reddit API error when fetching user profile fails unexpectedly', async () => {
    const tokenResponse = {
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'token' }),
      text: async () => '{"access_token":"token"}',
    } as const;

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(tokenResponse)
      .mockRejectedValueOnce(new Error('Network timeout'));

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const app = buildApp();

    const response = await request(app)
      .post('/api/social-qualify-form')
      .send(validPayload)
      .expect(400);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.body).toEqual({
      success: false,
      message: "Reddit user 'validuser' does not exist. Please check the username and try again.",
    });
  });

  it('covers console.log branches in verifyRedditAccount with valid credentials', async () => {
    // This test ensures the console.log branches when credentials exist are hit
    process.env.REDDIT_CLIENT_ID = 'valid-id';
    process.env.REDDIT_CLIENT_SECRET = 'valid-secret';

    const tokenResponse = {
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'token123' }),
      text: async () => '{"access_token":"token123"}',
    } as const;

    const userResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: { name: 'testuser' } }),
      text: async () => '{"data":{"name":"testuser"}}',
    } as const;

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(userResponse);

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const app = buildApp();

    const response = await request(app)
      .post('/api/social-qualify-form')
      .send({ ...validPayload, email: 'logging-test@example.com' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('covers console.log branches with missing credentials', async () => {
    const originalId = process.env.REDDIT_CLIENT_ID;
    const originalSecret = process.env.REDDIT_CLIENT_SECRET;
    
    delete process.env.REDDIT_CLIENT_ID;
    delete process.env.REDDIT_CLIENT_SECRET;
    
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const app = buildApp();

    const response = await request(app)
      .post('/api/social-qualify-form')
      .send({ ...validPayload, email: 'no-creds@example.com' })
      .expect(400);

    expect(fetchMock).not.toHaveBeenCalled();
    
    // Verify lines 56-63: console.log branches when credentials are missing
    expect(consoleLogSpy).toHaveBeenCalledWith('[REDDIT] Client ID configured:', 'NO');
    expect(consoleLogSpy).toHaveBeenCalledWith('[REDDIT] Client Secret configured:', 'NO');
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('REDDIT API CREDENTIALS NOT CONFIGURED'));
    
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.env.REDDIT_CLIENT_ID = originalId;
    process.env.REDDIT_CLIENT_SECRET = originalSecret;
  });

  it('covers console.log when Reddit credentials exist', async () => {
    process.env.REDDIT_CLIENT_ID = 'test-id';
    process.env.REDDIT_CLIENT_SECRET = 'test-secret';
    
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    const tokenResponse = {
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'token' }),
      text: async () => '{"access_token":"token"}',
    } as const;

    const userResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: { name: 'user' } }),
      text: async () => '{"data":{"name":"user"}}',
    } as const;

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(userResponse);

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const app = buildApp();

    await request(app)
      .post('/api/social-qualify-form')
      .send({ ...validPayload, email: 'creds-test@example.com' })
      .expect(200);

    // Verify lines 56-57: logs "YES" when credentials exist
    expect(consoleLogSpy).toHaveBeenCalledWith('[REDDIT] Client ID configured:', 'YES');
    expect(consoleLogSpy).toHaveBeenCalledWith('[REDDIT] Client Secret configured:', 'YES');
    
    consoleLogSpy.mockRestore();
  });

  it('covers console.log branches in Reddit API error handling', async () => {
    process.env.REDDIT_CLIENT_ID = 'test-id';
    process.env.REDDIT_CLIENT_SECRET = 'test-secret';
    
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    const tokenResponse = {
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => 'error',
    } as const;

    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse);
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const app = buildApp();

    await request(app)
      .post('/api/social-qualify-form')
      .send({ ...validPayload, email: 'error-test@example.com' })
      .expect(400);

    // Verify lines 70-72, 89: console.log and console.error in error paths
    expect(consoleLogSpy).toHaveBeenCalledWith('[REDDIT] OAuth response status:', 401);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[REDDIT] Failed to get Reddit OAuth token:',
      expect.anything()
    );
    
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('covers access token received logging branches', async () => {
    process.env.REDDIT_CLIENT_ID = 'test-id';
    process.env.REDDIT_CLIENT_SECRET = 'test-secret';
    
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // Test with access token present
    const tokenResponse1 = {
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'valid-token' }),
      text: async () => '{"access_token":"valid-token"}',
    } as const;

    const userResponse1 = {
      ok: true,
      status: 200,
      json: async () => ({ data: { name: 'testuser' } }),
      text: async () => '{"data":{"name":"testuser"}}',
    } as const;

    const fetchMock1 = vi.fn()
      .mockResolvedValueOnce(tokenResponse1)
      .mockResolvedValueOnce(userResponse1);

    vi.stubGlobal('fetch', fetchMock1 as unknown as typeof fetch);

    const app1 = buildApp();
    await request(app1)
      .post('/api/social-qualify-form')
      .send({ ...validPayload, email: 'token-test@example.com' })
      .expect(200);

    // Line 102: access_token ? \"YES\" : \"NO\" with token present
    expect(consoleLogSpy).toHaveBeenCalledWith('[REDDIT] OAuth token received:', 'YES');
    
    // Test with access token missing
    const tokenResponse2 = {
      ok: true,
      status: 200,
      json: async () => ({ access_token: null }),
      text: async () => '{"access_token":null}',
    } as const;

    const fetchMock2 = vi.fn().mockResolvedValueOnce(tokenResponse2);
    vi.stubGlobal('fetch', fetchMock2 as unknown as typeof fetch);

    const app2 = buildApp();
    await request(app2)
      .post('/api/social-qualify-form')
      .send({ ...validPayload, email: 'no-token@example.com' })
      .expect(400);

    // Line 102: access_token ? \"YES\" : \"NO\" with token absent
    expect(consoleLogSpy).toHaveBeenCalledWith('[REDDIT] OAuth token received:', 'NO');
    
    consoleLogSpy.mockRestore();
  });

  it('covers verified ternary branch in Reddit user verification', async () => {
    process.env.REDDIT_CLIENT_ID = 'test-id';
    process.env.REDDIT_CLIENT_SECRET = 'test-secret';
    
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // Test user NOT FOUND
    const tokenResponse = {
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'token' }),
      text: async () => '{"access_token":"token"}',
    } as const;

    const userResponse = {
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not Found' }),
      text: async () => '{"error":"Not Found"}',
    } as const;

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(userResponse);

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const app = buildApp();
    await request(app)
      .post('/api/social-qualify-form')
      .send({ ...validPayload, email: 'notfound@example.com' })
      .expect(400);

    // Line 121: verified ? "VERIFIED" : "NOT FOUND"
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[REDDIT\] User '.*' verification result: NOT FOUND/)
    );
    
    consoleLogSpy.mockRestore();
  });
});

describe('POST /api/check-user-exists additional branch coverage', () => {
  it('covers JSON parse error in Buffer handling', async () => {
    const app = buildApp();
    
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Send invalid JSON as Buffer
    const invalidJson = Buffer.from('{invalid json}');
    
    await request(app)
      .post('/api/check-user-exists')
      .set('Content-Type', 'application/octet-stream')
      .send(invalidJson)
      .expect(400);
    
    // Lines 154-159: catch block for JSON.parse error on Buffer
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[API] Failed to parse JSON from buffer:',
      expect.anything()
    );
    
    consoleErrorSpy.mockRestore();
  });

  it('covers JSON parse error in string handling', async () => {
    const app = buildApp();
    
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Send invalid JSON as string
    await request(app)
      .post('/api/check-user-exists')
      .set('Content-Type', 'text/plain')
      .send('{invalid json string}')
      .expect(400);
    
    // Lines 166-171: catch block for JSON.parse error on string
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[API] Failed to parse JSON from string:',
      expect.anything()
    );
    
    consoleErrorSpy.mockRestore();
  });
});

describe('POST /api/social-qualify-form additional branch coverage', () => {
  it('covers JSON parse error in Buffer handling', async () => {
    const app = buildApp();
    
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Send invalid JSON as Buffer
    const invalidJson = Buffer.from('{not valid json}');
    
    await request(app)
      .post('/api/social-qualify-form')
      .set('Content-Type', 'application/octet-stream')
      .send(invalidJson)
      .expect(400);
    
    // Lines 236-241: catch block for JSON.parse error on Buffer
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[API] Failed to parse JSON from buffer:',
      expect.anything()
    );
    
    consoleErrorSpy.mockRestore();
  });

  it('covers JSON parse error in string handling', async () => {
    const app = buildApp();
    
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Send invalid JSON as string
    await request(app)
      .post('/api/social-qualify-form')
      .set('Content-Type', 'text/plain')
      .send('{this is not valid json either}')
      .expect(400);
    
    // Lines 248-253: catch block for JSON.parse error on string
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[API] Failed to parse JSON from string:',
      expect.anything()
    );
    
    consoleErrorSpy.mockRestore();
  });
});

describe('POST /api/check-user-exists', () => {
  it('returns userExists false when user not found', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/check-user-exists')
      .send({ email: 'newuser@example.com', phone: '+19876543210' })
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      userExists: false,
    });
  });

  it('returns 400 when email or phone missing in check-user-exists', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/check-user-exists')
      .send({ email: '' })
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      message: 'Email and phone are required',
    });
  });

  it('parses string payload in check-user-exists', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/check-user-exists')
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify({ email: 'test@example.com', phone: '+1234567890' }))
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.userExists).toBe(false);
  });
});

describe('social-qualify-form database utilities', () => {
  it('uses TEST_DATABASE_URL when running in test mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalTestUrl = process.env.TEST_DATABASE_URL;

    process.env.NODE_ENV = 'test';
    process.env.TEST_DATABASE_URL = 'postgres://test-db-url';

    vi.resetModules();
    const { getDatabaseUrl } = await import('../social-qualify-form');

    expect(getDatabaseUrl()).toBe('postgres://test-db-url');

    process.env.NODE_ENV = originalEnv;
    process.env.TEST_DATABASE_URL = originalTestUrl;
    vi.resetModules();
  });

  it('uses DATABASE_URL when not in test mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalDatabaseUrl = process.env.DATABASE_URL;

    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://prod-db-url';

    vi.resetModules();
    const { getDatabaseUrl } = await import('../social-qualify-form');

    expect(getDatabaseUrl()).toBe('postgres://prod-db-url');

    process.env.NODE_ENV = originalEnv;
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    vi.resetModules();
  });

  it('throws informative error when TEST_DATABASE_URL missing in test mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalTestUrl = process.env.TEST_DATABASE_URL;

    process.env.NODE_ENV = 'test';
    delete process.env.TEST_DATABASE_URL;

    vi.resetModules();
    const { getDatabaseUrl } = await import('../social-qualify-form');

    expect(() => getDatabaseUrl()).toThrow('TEST_DATABASE_URL environment variable is not set');

    process.env.NODE_ENV = originalEnv;
    process.env.TEST_DATABASE_URL = originalTestUrl;
    vi.resetModules();
  });

  it('throws informative error when DATABASE_URL missing outside test mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalDatabaseUrl = process.env.DATABASE_URL;

    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;

    vi.resetModules();
    const { getDatabaseUrl } = await import('../social-qualify-form');

    expect(() => getDatabaseUrl()).toThrow('DATABASE_URL environment variable is not set');

    process.env.NODE_ENV = originalEnv;
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    vi.resetModules();
  });

  it('logs NO when database URL is missing', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalTestUrl = process.env.TEST_DATABASE_URL;

    process.env.NODE_ENV = 'test';
    delete process.env.TEST_DATABASE_URL;

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.resetModules();
    const { createServer: freshCreateServer } = await import('../../index');
    const app = freshCreateServer();

    await request(app)
      .post('/api/social-qualify-form')
      .send(validPayload)
      .expect(500);

    expect(consoleLogSpy).toHaveBeenCalledWith('[DB] Database URL configured:', 'NO');

    consoleLogSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
    process.env.TEST_DATABASE_URL = originalTestUrl;
    vi.resetModules();
  });

  it('covers getDatabase catch branch when Pool construction fails', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalTestUrl = process.env.TEST_DATABASE_URL;
    const originalClientId = process.env.REDDIT_CLIENT_ID;
    const originalClientSecret = process.env.REDDIT_CLIENT_SECRET;

    process.env.NODE_ENV = 'test';
    process.env.TEST_DATABASE_URL = 'postgres://failing-db';
    process.env.REDDIT_CLIENT_ID = 'id';
    process.env.REDDIT_CLIENT_SECRET = 'secret';

    vi.resetModules();

    vi.doMock('pg', () => ({
      Pool: class {
        constructor() {
          throw new Error('Simulated pool failure');
        }
      }
    }));

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn());

    const { createServer: freshCreateServer } = await import('../../index');
    const app = freshCreateServer();

    await request(app)
      .post('/api/social-qualify-form')
      .send(validPayload)
      .expect(500);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[DB] Failed to create PostgreSQL connection pool:',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals?.();
    process.env.NODE_ENV = originalEnv;
    process.env.TEST_DATABASE_URL = originalTestUrl;
    process.env.REDDIT_CLIENT_ID = originalClientId;
    process.env.REDDIT_CLIENT_SECRET = originalClientSecret;
    vi.doUnmock('pg');
    vi.resetModules();
  });
});
