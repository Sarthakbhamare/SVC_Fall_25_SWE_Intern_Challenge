import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createServer } from '../../index';

describe('GET /api/demo', () => {
  it('returns the demo message', async () => {
    const app = createServer();

    const response = await request(app)
      .get('/api/demo')
      .expect(200);

    expect(response.body).toEqual({
      message: 'Hello from Express server',
    });
    expect(response.body.message).toBe('Hello from Express server');
  });

  it('handles demo route with proper headers', async () => {
    const app = createServer();

    const response = await request(app)
      .get('/api/demo')
      .set('Accept', 'application/json')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toHaveProperty('message');
  });
});
