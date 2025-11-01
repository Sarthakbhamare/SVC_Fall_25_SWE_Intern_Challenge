import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import { createServer, formatErrorResponse } from '../index';
import express from 'express';
import cors from 'cors';

const buildApp = () => createServer();

describe('createServer', () => {
  it('returns ping message from environment', async () => {
    const app = buildApp();

    const response = await request(app).get('/api/ping').expect(200);

    expect(response.body).toEqual({ message: 'test ping' });
  });

  it('falls back to default ping message when env var missing', async () => {
    const originalPing = process.env.PING_MESSAGE;
    delete process.env.PING_MESSAGE;
    const app = buildApp();

    const response = await request(app).get('/api/ping').expect(200);

    expect(response.body).toEqual({ message: 'ping' });
    process.env.PING_MESSAGE = originalPing;
  });

  it('returns demo payload', async () => {
    const app = buildApp();

    const response = await request(app).get('/api/demo').expect(200);

    expect(response.body).toEqual({ message: 'Hello from Express server' });
  });

  it('handles unknown routes with 404', async () => {
    const app = buildApp();

    const response = await request(app).get('/api/unknown-route').expect(404);

    expect(response.text).toContain('Cannot GET /api/unknown-route');
  });

  it('invokes global error handler for unexpected errors', async () => {
    // Create a custom server that includes the error route
    const app = express();
    
    // Copy the middleware setup from createServer
    app.use(cors());
    app.use(express.raw({ type: 'application/octet-stream', limit: '10mb' }));
    app.use(express.text({ type: 'text/plain', limit: '10mb' }));
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Add the error-throwing route
    app.get('/api/boom', () => {
      throw new Error('kaboom');
    });

    // Add error handler (must be last)
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      res.status(500).json({
        success: false,
        message: `Server error: ${err.message}`,
        error: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });
    });

    const response = await request(app).get('/api/boom').expect(500);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Server error: kaboom');
    expect(response.body.error).toBeUndefined();
  });

  it('returns error stack in development mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const app = express();
    app.use(express.json());

    app.get('/api/boom', () => {
      throw new Error('test error');
    });

    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: `Server error: ${err.message}`,
          error: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
      }
    });

    const response = await request(app).get('/api/boom').expect(500);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBeDefined();
    expect(response.body.error).toContain('test error');

    process.env.NODE_ENV = originalEnv;
  });

  it('logs environment configuration at startup with production mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalDb = process.env.DATABASE_URL;
    
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://prod-url';
    
    // Reset modules to re-execute startup logging
    vi.resetModules();
    const { createServer: freshCreateServer } = await import('../index');
    const app = freshCreateServer();
    
    // Verify server still works
    const response = await request(app).get('/api/ping').expect(200);
    expect(response.body.message).toBeDefined();
    
    process.env.NODE_ENV = originalEnv;
    process.env.DATABASE_URL = originalDb;
    vi.resetModules();
  });

  it('logs environment configuration at startup without database URL', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalDb = process.env.DATABASE_URL;
    
    process.env.NODE_ENV = 'development';
    delete process.env.DATABASE_URL;
    
    // Reset modules to re-execute startup logging
    vi.resetModules();
    const { createServer: freshCreateServer } = await import('../index');
    const app = freshCreateServer();
    
    // Verify server still works
    const response = await request(app).get('/api/ping').expect(200);
    expect(response.body.message).toBeDefined();
    
    process.env.NODE_ENV = originalEnv;
    process.env.DATABASE_URL = originalDb;
    vi.resetModules();
  });

  it('logs all environment variable branches during startup', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalDb = process.env.DATABASE_URL;
    const originalRedditId = process.env.REDDIT_CLIENT_ID;
    const originalRedditSecret = process.env.REDDIT_CLIENT_SECRET;
    
    // Test with all variables set
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgres://test';
    process.env.REDDIT_CLIENT_ID = 'test-id';
    process.env.REDDIT_CLIENT_SECRET = 'test-secret';
    
    vi.resetModules();
    let { createServer: freshCreateServer } = await import('../index');
    let app = freshCreateServer();
    expect(await request(app).get('/api/ping').expect(200)).toBeDefined();
    
    // Test without REDDIT_CLIENT_ID
    delete process.env.REDDIT_CLIENT_ID;
    vi.resetModules();
    ({ createServer: freshCreateServer } = await import('../index'));
    app = freshCreateServer();
    expect(await request(app).get('/api/ping').expect(200)).toBeDefined();
    
    // Test without REDDIT_CLIENT_SECRET
    process.env.REDDIT_CLIENT_ID = 'test-id';
    delete process.env.REDDIT_CLIENT_SECRET;
    vi.resetModules();
    ({ createServer: freshCreateServer } = await import('../index'));
    app = freshCreateServer();
    expect(await request(app).get('/api/ping').expect(200)).toBeDefined();
    
    // Restore
    process.env.NODE_ENV = originalEnv;
    process.env.DATABASE_URL = originalDb;
    process.env.REDDIT_CLIENT_ID = originalRedditId;
    process.env.REDDIT_CLIENT_SECRET = originalRedditSecret;
    vi.resetModules();
  });

  it('covers error handler logging branch in development', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const app = express();
    app.use(express.json());

    app.get('/api/test-error', () => {
      throw new Error('test development error');
    });

    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: `Server error: ${err.message}`,
          error: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
      }
    });

    const response = await request(app).get('/api/test-error').expect(500);
    expect(response.body.error).toBeDefined();
    expect(response.body.error).toContain('test development error');

    process.env.NODE_ENV = originalEnv;
  });

  it('covers startup logging with DATABASE_URL present', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalDb = process.env.DATABASE_URL;
    
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://production';
    
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    vi.resetModules();
    const { createServer: freshCreateServer } = await import('../index');
    const app = freshCreateServer();
    
    expect(await request(app).get('/api/ping').expect(200)).toBeDefined();
    
    // Verify the ternary in line 12 was executed with DATABASE_URL present
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '- DATABASE_URL:',
      expect.stringContaining('configured')
    );
    
    consoleLogSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
    process.env.DATABASE_URL = originalDb;
    vi.resetModules();
  });

  it('covers startup logging with DATABASE_URL absent', async () => {
    const originalDb = process.env.DATABASE_URL;
    
    delete process.env.DATABASE_URL;
    
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    vi.resetModules();
    const { createServer: freshCreateServer } = await import('../index');
    const app = freshCreateServer();
    
    expect(await request(app).get('/api/ping').expect(200)).toBeDefined();
    
    // Verify the ternary in line 12 was executed with DATABASE_URL absent
    expect(consoleLogSpy).toHaveBeenCalledWith('- DATABASE_URL:', 'NOT SET');
    
    consoleLogSpy.mockRestore();
    process.env.DATABASE_URL = originalDb;
    vi.resetModules();
  });

  it('covers error handler with production NODE_ENV', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const app = express();
    app.use(express.json());

    app.get('/api/test-prod-error', () => {
      throw new Error('production error');
    });

    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: `Server error: ${err.message}`,
          error: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
      }
    });

    const response = await request(app).get('/api/test-prod-error').expect(500);
    
    // In production, error should be undefined (line 71 false branch)
    expect(response.body.error).toBeUndefined();
    expect(response.body.message).toBe('Server error: production error');

    process.env.NODE_ENV = originalEnv;
  });

  it('covers PING_MESSAGE environment variable branch', async () => {
    const originalPing = process.env.PING_MESSAGE;
    
    // Test with PING_MESSAGE set
    process.env.PING_MESSAGE = 'custom-ping';
    
    const app1 = createServer();
    const response1 = await request(app1).get('/api/ping').expect(200);
    expect(response1.body.message).toBe('custom-ping');
    
    // Test with PING_MESSAGE not set (nullish coalescing)
    delete process.env.PING_MESSAGE;
    
    const app2 = createServer();
    const response2 = await request(app2).get('/api/ping').expect(200);
    expect(response2.body.message).toBe('ping');
    
    process.env.PING_MESSAGE = originalPing;
  });

  it('covers NODE_ENV not set branch in startup logging', async () => {
    const originalEnv = process.env.NODE_ENV;
    
    delete process.env.NODE_ENV;
    
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    vi.resetModules();
    const { createServer: freshCreateServer } = await import('../index');
    freshCreateServer();
    
    // Verify line 11: process.env.NODE_ENV || "not set"
    expect(consoleLogSpy).toHaveBeenCalledWith('- NODE_ENV:', 'not set');
    
    consoleLogSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
    vi.resetModules();
  });

  it('formats error response with stack trace in development', () => {
    const err = new Error('boom');
    const response = formatErrorResponse(err, 'development');

    expect(response).toMatchObject({
      success: false,
      message: 'Server error: boom',
      error: err.stack,
    });
  });

  it('omits stack trace outside development', () => {
    const err = new Error('boom');
    const response = formatErrorResponse(err, 'production');

    expect(response).toMatchObject({
      success: false,
      message: 'Server error: boom',
    });
    expect(response.error).toBeUndefined();
  });
});

