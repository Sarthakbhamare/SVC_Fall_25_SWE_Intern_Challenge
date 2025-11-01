import { describe, it, expect, vi } from 'vitest';

const noop = () => undefined;

describe('database configuration', () => {
  it('enables SSL when connecting to Neon hosted databases', async () => {
    const originalUrl = process.env.TEST_DATABASE_URL;
    process.env.TEST_DATABASE_URL = 'postgresql://user:pass@demo.neon.tech/db';

    const queryMock = vi.fn().mockResolvedValue({ rows: [] });
    const endMock = vi.fn();
    let capturedConfig: any;

    vi.doMock('pg', () => ({
      Pool: vi.fn().mockImplementation((config) => {
        capturedConfig = config;
        return { query: queryMock, end: endMock };
      }),
    }));

    vi.resetModules();
    const { handleCheckUserExists } = await import('../social-qualify-form');

    const statusMock = vi.fn().mockReturnThis();
    const jsonMock = vi.fn();

    await handleCheckUserExists(
      { body: { email: 'a@example.com', phone: '+1234567890' } } as any,
      { status: statusMock, json: jsonMock } as any,
      noop as any,
    );

    expect(capturedConfig?.ssl).toEqual({ rejectUnauthorized: false });

    vi.resetModules();
    vi.unmock('pg');
    process.env.TEST_DATABASE_URL = originalUrl;
  });
});
