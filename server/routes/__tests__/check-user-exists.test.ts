import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { createServer } from '../../index';
import { getTestPool } from '../../tests/setup';

const buildApp = () => createServer();

const basePayload = {
  email: 'someone@example.com',
  phone: '+1234567890',
};

beforeEach(() => {
  process.env.REDDIT_CLIENT_ID = 'test-client-id';
  process.env.REDDIT_CLIENT_SECRET = 'test-client-secret';
});

describe('POST /api/check-user-exists', () => {
  it('returns userExists false when no matching record', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/check-user-exists')
      .send(basePayload)
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      userExists: false,
    });
  });

  it('returns userExists true when matching record exists', async () => {
    await getTestPool().query(
      `INSERT INTO users (email, phone, reddit_username, reddit_verified)
       VALUES ($1, $2, $3, $4)`,
      [basePayload.email, basePayload.phone, 'existinguser', true],
    );

    const app = buildApp();

    const response = await request(app)
      .post('/api/check-user-exists')
      .send(basePayload)
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      userExists: true,
    });
  });

  it('parses Buffer body payloads', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/check-user-exists')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from(JSON.stringify(basePayload)))
      .expect(200);

    expect(response.body.userExists).toBe(false);
  });

  it('parses JSON string payloads', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/check-user-exists')
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(basePayload))
      .expect(200);

    expect(response.body.userExists).toBe(false);
  });

  it('returns 400 when payload is missing email or phone', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/check-user-exists')
      .send({ email: '', phone: '' })
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      message: 'Email and phone are required',
    });
  });

  it('returns 400 when buffer payload cannot be parsed', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/check-user-exists')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('not-json'))
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      message: 'Invalid JSON in request body',
    });
  });

  it('returns 500 when database query fails unexpectedly', async () => {
    const app = buildApp();
    const querySpy = vi.spyOn(Pool.prototype, 'query').mockImplementationOnce(() => {
      throw new Error('db down');
    });

    const response = await request(app)
      .post('/api/check-user-exists')
      .send(basePayload)
      .expect(500);

    expect(querySpy).toHaveBeenCalled();
    expect(response.body).toEqual({
      success: false,
      message: 'Internal server error: db down',
    });
  });
});
