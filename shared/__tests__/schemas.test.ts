import { describe, it, expect } from 'vitest';
import {
  SocialQualifyFormSchema,
  ContractorRequestSchema,
  UserSchema,
  ContractorSchema,
} from '../schemas';

describe('shared schemas', () => {
  it('validates social qualify form with defaults', () => {
    const result = SocialQualifyFormSchema.parse({
      email: 'user@example.com',
      phone: '+1234567890',
      redditUsername: 'reddit-user',
    });

    expect(result).toEqual({
      email: 'user@example.com',
      phone: '+1234567890',
      redditUsername: 'reddit-user',
      twitterUsername: undefined,
      youtubeUsername: undefined,
      facebookUsername: undefined,
    });
  });

  it('validates contractor request', () => {
    const result = ContractorRequestSchema.parse({
      email: 'user@example.com',
      companySlug: 'svc',
      companyName: 'Silicon Valley Consulting',
    });

    expect(result).toEqual({
      email: 'user@example.com',
      companySlug: 'svc',
      companyName: 'Silicon Valley Consulting',
    });
  });

  it('applies defaults for user schema', () => {
    const result = UserSchema.parse({
      email: 'user@example.com',
      phone: '+1234567890',
      reddit_username: 'reddit-user',
    });

    expect(result.reddit_verified).toBe(false);
  });

  it('applies defaults for contractor schema', () => {
    const result = ContractorSchema.parse({
      user_id: 1,
      email: 'user@example.com',
      company_slug: 'svc',
      company_name: 'Silicon Valley Consulting',
    });

    expect(result.status).toBe('pending');
    expect(result.joined_slack).toBe(false);
    expect(result.can_start_job).toBe(false);
  });
});
