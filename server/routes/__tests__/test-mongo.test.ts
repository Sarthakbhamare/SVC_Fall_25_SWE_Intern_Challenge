import { describe, it, expect, vi } from 'vitest';
import { handleTestMongo } from '../test-mongo';

const createMockResponse = () => {
  const json = vi.fn();
  return {
    json,
  } as any;
};

describe('handleTestMongo', () => {
  it('reports environment variable status', async () => {
    process.env.MONGODB_URI = 'mongodb://example';
    process.env.REDDIT_CLIENT_ID = 'client';
    process.env.REDDIT_CLIENT_SECRET = 'secret';

    const res = createMockResponse();

    await handleTestMongo({} as any, res);

    expect(res.json).toHaveBeenCalledWith({
      mongoConfigured: true,
      mongoUri: 'mongodb://example',
      redditConfigured: true,
    });
  });
});
